// POST /api/wrongbook/record — 將「錯題本 · 重做練習」的作答寫入作答紀錄
//
// 目的:讓使用者在錯題本重做時「又錯了」能被記錄,使 wrongCount(反覆錯標籤)
// 正確累積。這些紀錄標記 source = "wrongbook-redo"。統計頁(/api/stats)會
// 將其排除,避免污染總正確率;但錯題本 GET 仍會計入(其查詢僅過濾 isCorrect:false)。
import { NextRequest, NextResponse } from "next/server";
import { createAttempt, type AttemptRecord, type AnswerRecord } from "@/lib/kv";
import { getQuestionById } from "@/lib/data";
import { requireSession } from "@/lib/auth";

const REDO_SOURCE = "wrongbook-redo";

let idCounter = Date.now();
function genId(): string {
  return `at_${(idCounter++).toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

type RecordedAnswer = { questionId: string; userAnswer?: string };

export async function POST(req: NextRequest) {
  const session = requireSession(req);
  if (session instanceof NextResponse) return session;
  const sessionId = session.sessionId;

  const body = (await req.json()) as { answers?: RecordedAnswer[] };
  const { answers } = body;

  if (!Array.isArray(answers) || answers.length === 0) {
    return NextResponse.json({ ok: true, recorded: 0 });
  }

  // 只處理有實際作答(非空)的題目
  const valid = answers.filter(
    (a) => a && a.questionId && typeof a.userAnswer === "string" && a.userAnswer.trim() !== ""
  );
  if (valid.length === 0) {
    return NextResponse.json({ ok: true, recorded: 0 });
  }

  // 依 paper 分組(錯題本可能跨多卷,而 Attempt 只能屬於單一卷)
  // paperId 取自題號 id 的前綴,例如 "exam1-2024-123" → "exam1-2024"
  const byPaper = new Map<string, AnswerRecord[]>();
  for (const a of valid) {
    const q = getQuestionById(a.questionId);
    if (!q) continue; // 題目不存在則跳過
    const paperId = a.questionId.split("-")[0];
    const isCorrect =
      (a.userAnswer ?? "").toUpperCase() === (q.answer ?? "").toUpperCase();
    const rec: AnswerRecord = {
      questionId: a.questionId,
      userAnswer: a.userAnswer as string,
      isCorrect,
      timeSpentMs: null,
      createdAt: new Date().toISOString(),
    };
    if (!byPaper.has(paperId)) byPaper.set(paperId, []);
    byPaper.get(paperId)!.push(rec);
  }

  const now = new Date().toISOString();
  let recorded = 0;
  for (const [paperId, list] of byPaper) {
    if (list.length === 0) continue;
    const correctCount = list.filter((x) => x.isCorrect).length;
    const record: AttemptRecord = {
      id: genId(),
      sessionId,
      paperId,
      mode: REDO_SOURCE,
      source: REDO_SOURCE,
      startedAt: now,
      finishedAt: now,
      durationSec: null,
      totalQ: list.length,
      correct: correctCount,
      answers: list,
    };
    await createAttempt(record);
    recorded += list.length;
  }

  return NextResponse.json({ ok: true, recorded });
}
