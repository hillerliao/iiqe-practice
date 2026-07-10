import { NextRequest, NextResponse } from "next/server";
import {
  createAttempt, getAttempt, findUnfinishedAttempt, listAttempts,
  attemptKey, AnswerRecord, AttemptRecord,
} from "@/lib/kv";
import { getQuestions, getQuestionById } from "@/lib/data";
import { requireSession } from "@/lib/auth";

let idCounter = Date.now();
function genId(): string {
  return `at_${(idCounter++).toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(req: NextRequest) {
  const session = requireSession(req);
  if (session instanceof NextResponse) return session;
  const sessionId = session.sessionId;

  const body = await req.json().catch(() => ({}));
  const { paperId, mode, source, durationSec, questionIds, fromAttemptId } = body as Record<string, unknown>;

  let finalQuestionIds: string[] = Array.isArray(questionIds) ? (questionIds as string[]) : [];
  let finalPaperId = paperId;
  let finalMode = mode;
  let finalSource = source;
  let finalDurationSec = durationSec;

  if (fromAttemptId && typeof fromAttemptId === "string") {
    const src = await getAttempt(fromAttemptId);
    if (!src) {
      return NextResponse.json({ error: "來源 attempt 找不到" }, { status: 404 });
    }
    finalQuestionIds = src.answers.map((a) => a.questionId);
    finalPaperId = src.paperId;
    finalMode = src.mode;
    finalSource = src.source;
    finalDurationSec = src.durationSec;
  }

  if (!finalPaperId || !Array.isArray(finalQuestionIds) || finalQuestionIds.length === 0) {
    return NextResponse.json(
      { error: "paperId, questionIds[] 必填(fromAttemptId 模式需有作答記錄)" },
      { status: 400 }
    );
  }

  const id = genId();
  const now = new Date().toISOString();

  const record: AttemptRecord = {
    id,
    sessionId,
    paperId: finalPaperId as string,
    mode: (finalMode as string) ?? "exam",
    source: (finalSource as string) ?? "exam",
    durationSec: (finalDurationSec as number) ?? null,
    totalQ: finalQuestionIds.length,
    startedAt: now,
    finishedAt: null,
    correct: 0,
    answers: [],
  };

  await createAttempt(record);

  let questions: any[] | undefined;
  if (fromAttemptId) {
    questions = finalQuestionIds
      .map((qid) => getQuestionById(qid))
      .filter((q): q is NonNullable<typeof q> => q != null)
      .map((q) => ({
        id: q.id,
        number: q.number,
        ref: q.ref,
        question: q.question,
        options: q.options,
        answer: q.answer?.toLowerCase() ?? "",
        explanation: q.explanation,
        page: q.page,
      }));
  }

  return NextResponse.json({ attempt: record, questions });
}

export async function GET(req: NextRequest) {
  const session = requireSession(req);
  if (session instanceof NextResponse) return session;
  const sessionId = session.sessionId;

  const url = new URL(req.url);
  const unfinished = url.searchParams.get("unfinished") === "1";
  const paperId = url.searchParams.get("paperId");
  const source = url.searchParams.get("source");

  if (unfinished) {
    const attempt = await findUnfinishedAttempt(sessionId, paperId ?? undefined, source ?? undefined);
    let latestAnsweredNumber: number | null = null;
    if (attempt && paperId) {
      const allAttempts = await listAttempts(sessionId);
      let maxNum = 0;
      for (const at of allAttempts) {
        if (at.paperId !== paperId) continue;
        if (source && at.source !== source) continue;
        for (const ans of at.answers) {
          const q = getQuestionById(ans.questionId);
          if (q && q.number > maxNum) maxNum = q.number;
        }
      }
      latestAnsweredNumber = maxNum > 0 ? maxNum : null;
    }
    return NextResponse.json({ attempt, latestAnsweredNumber });
  }

  const attempts = await listAttempts(sessionId);
  return NextResponse.json({ attempts });
}
