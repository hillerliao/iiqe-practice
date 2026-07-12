import { NextRequest, NextResponse } from "next/server";
import {
  createFeedback,
  listFeedback,
  listAllFeedback,
  type FeedbackCategory,
  type FeedbackRecord,
} from "@/lib/kv";
import { getQuestionById } from "@/lib/data";
import { requireSession } from "@/lib/auth";

const VALID_CATEGORIES: FeedbackCategory[] = [
  "question_error",
  "answer_error",
  "explanation_unclear",
  "typo",
];

const MAX_DESC_LEN = 500;

function isCategory(v: unknown): v is FeedbackCategory {
  return typeof v === "string" && (VALID_CATEGORIES as string[]).includes(v);
}

// 不可逆短哈希，管理員列表用來區分不同用戶，但不洩露 email/帳號(PII)
function maskSessionId(sid: string): string {
  let h = 0;
  for (let i = 0; i < sid.length; i++) h = (h * 31 + sid.charCodeAt(i)) >>> 0;
  return `u_${h.toString(36)}`;
}

export async function GET(req: NextRequest) {
  const session = requireSession(req);
  if (session instanceof NextResponse) return session;
  const sessionId = session.sessionId;

  const url = new URL(req.url);
  const limit = Math.min(500, parseInt(url.searchParams.get("limit") ?? "100", 10) || 100);

  const admin = session.isAdmin;

  const rawItems: FeedbackRecord[] = admin
    ? await listAllFeedback(limit)
    : await listFeedback(sessionId, limit);

  // 附加題目摘要供查看頁直接渲染
  const items = rawItems.map((it) => {
    const q = getQuestionById(it.questionId);
    return {
      ...it,
      // H3: 管理員視圖下脫敏 sessionId，避免洩露他人 email/帳號
      sessionId: admin ? maskSessionId(it.sessionId) : it.sessionId,
      question: q
        ? {
            id: q.id,
            number: q.number,
            ref: q.ref,
            question: q.question,
            options: q.options,
            answer: q.answer?.toLowerCase() ?? "",
            explanation: q.explanation,
            page: q.page,
            source: q.source,
            sourceLabel: q.sourceLabel,
          }
        : null,
    };
  });

  return NextResponse.json({ count: items.length, isAdmin: admin, items });
}

export async function POST(req: NextRequest) {
  const session = requireSession(req);
  if (session instanceof NextResponse) return session;
  const sessionId = session.sessionId;

  let body: { questionId?: unknown; category?: unknown; description?: unknown; userAnswer?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { questionId, category, description, userAnswer } = body ?? {};

  if (!questionId || typeof questionId !== "string") {
    return NextResponse.json({ error: "questionId 必填" }, { status: 400 });
  }
  if (!questionId || typeof questionId !== "string") {
    return NextResponse.json({ error: "questionId 必填" }, { status: 400 });
  }
  if (!isCategory(category)) {
    return NextResponse.json(
      { error: "category 不合法", allowed: VALID_CATEGORIES },
      { status: 400 }
    );
  }
  if (typeof description !== "string") {
    return NextResponse.json({ error: "description 必為字串" }, { status: 400 });
  }
  const trimmed = description.trim();
  if (trimmed.length > MAX_DESC_LEN) {
    return NextResponse.json(
      { error: `description 不可超過 ${MAX_DESC_LEN} 字(目前 ${trimmed.length})` },
      { status: 400 }
    );
  }

  const question = getQuestionById(questionId);
  if (!question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  const parts = questionId.split("-");
  const paperCode = parts[0] ?? "";
  const source = parts[1] ?? question.source ?? "";

  const id = crypto.randomUUID();
  const record: FeedbackRecord = {
    id,
    sessionId,
    questionId,
    paperCode,
    source,
    sourceLabel: question.sourceLabel ?? null,
    number: question.number,
    ref: question.ref ?? null,
    category,
    description: trimmed,
    userAnswer: typeof userAnswer === "string" && userAnswer.length > 0 ? userAnswer : null,
    userAgent: req.headers.get("user-agent") ?? "",
    createdAt: new Date().toISOString(),
  };

  await createFeedback(record);

  return NextResponse.json({ id, createdAt: record.createdAt });
}
