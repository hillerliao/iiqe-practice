import { NextRequest, NextResponse } from "next/server";
import {
  createAttempt, getAttempt, findUnfinishedAttempt, listAttempts,
  attemptKey, AnswerRecord, AttemptRecord,
} from "@/lib/kv";
import { getQuestions, getQuestionById } from "@/lib/data";

let idCounter = Date.now();
function genId(): string {
  return `at_${(idCounter++).toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { sessionId, paperId, mode, source, durationSec, questionIds, fromAttemptId } = body;

  let finalQuestionIds: string[] = questionIds;
  let finalPaperId = paperId;
  let finalMode = mode;
  let finalSource = source;
  let finalDurationSec = durationSec;

  if (fromAttemptId) {
    if (!sessionId) {
      return NextResponse.json({ error: "sessionId 必填" }, { status: 400 });
    }
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

  if (!sessionId || !finalPaperId || !Array.isArray(finalQuestionIds) || finalQuestionIds.length === 0) {
    return NextResponse.json(
      { error: "sessionId, paperId, questionIds[] 必填(fromAttemptId 模式需有作答記錄)" },
      { status: 400 }
    );
  }

  const id = genId();
  const now = new Date().toISOString();

  const record: AttemptRecord = {
    id,
    sessionId,
    paperId: finalPaperId,
    mode: finalMode ?? "exam",
    source: finalSource ?? "exam",
    durationSec: finalDurationSec ?? null,
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
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId 必填" }, { status: 400 });
  }

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
