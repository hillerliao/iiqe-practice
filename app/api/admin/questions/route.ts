// 管理員題目管理 API:
// - GET:  列表查詢(走 SQLite,讀最新數據,搜索 + 篩選 + 分頁)
// - POST: 新增題目(自動生成 id,雙寫 SQLite + JSON)
//
// 鑒權:必須 isAdmin(sessionId)
// 環境:必須 backend === "sqlite"

import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin";
import { pickStorageBackend } from "@/lib/storage-backend";
import {
  listQuestionsSqlite,
} from "@/lib/kv-sqlite";
import {
  saveQuestion,
  allocateNextQuestionId,
} from "@/lib/question-write";
import type { QuestionData } from "@/lib/data";

type OptionKey = "a" | "b" | "c" | "d";
const VALID_ANSWERS: ReadonlyArray<OptionKey> = ["a", "b", "c", "d"];

function isOptionKey(v: unknown): v is OptionKey {
  return typeof v === "string" && (VALID_ANSWERS as readonly string[]).includes(v);
}

function validateOptions(opts: unknown): opts is Record<OptionKey, string> {
  if (!opts || typeof opts !== "object" || Array.isArray(opts)) return false;
  for (const k of VALID_ANSWERS) {
    const v = (opts as Record<string, unknown>)[k];
    if (typeof v !== "string") return false;
  }
  return true;
}

function ensureWritable(): NextResponse | null {
  if (pickStorageBackend() !== "sqlite") {
    return NextResponse.json(
      {
        error:
          "當前部署不支持題目編輯(僅 SQLite 後端可寫)。請到 VPS / 本地後台操作。",
      },
      { status: 403 }
    );
  }
  return null;
}

export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId 必填" }, { status: 400 });
  }
  if (!isAdmin(sessionId)) {
    return NextResponse.json({ error: "僅管理員可訪問" }, { status: 403 });
  }

  const writableBlock = ensureWritable();
  if (writableBlock) return writableBlock;

  const url = req.nextUrl;
  const paperCode = url.searchParams.get("paperCode") || undefined;
  const source = url.searchParams.get("source") || undefined;
  const search = url.searchParams.get("q") || undefined;
  const limit = Math.min(
    200,
    Math.max(1, parseInt(url.searchParams.get("limit") ?? "50", 10) || 50)
  );
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);

  const result = await listQuestionsSqlite({
    paperCode,
    source,
    search,
    limit,
    offset,
  });
  return NextResponse.json({
    items: result.items,
    total: result.total,
    limit,
    offset,
  });
}

export async function POST(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ error: "sessionId 必填" }, { status: 400 });
  }
  if (!isAdmin(sessionId)) {
    return NextResponse.json({ error: "僅管理員可新增題目" }, { status: 403 });
  }

  const writableBlock = ensureWritable();
  if (writableBlock) return writableBlock;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { paperCode, source, question, options, answer, ref, explanation, page, sourceLabel } =
    body ?? {};

  if (typeof paperCode !== "string" || !paperCode.trim()) {
    return NextResponse.json({ error: "paperCode 必填" }, { status: 400 });
  }
  if (source !== "exam" && source !== "mock") {
    return NextResponse.json(
      { error: "source 必須是 exam 或 mock" },
      { status: 400 }
    );
  }
  if (typeof question !== "string" || !question.trim()) {
    return NextResponse.json({ error: "question 必填" }, { status: 400 });
  }
  if (!validateOptions(options)) {
    return NextResponse.json(
      { error: "options 必須包含 a/b/c/d 四個非空字串" },
      { status: 400 }
    );
  }
  if (!isOptionKey(answer)) {
    return NextResponse.json(
      { error: "answer 必須是 a/b/c/d 之一" },
      { status: 400 }
    );
  }

  try {
    const { id, number } = await allocateNextQuestionId(paperCode, source);
    const refValue: string = typeof ref === "string" ? ref.trim() : "";
    const explanationValue: string | null =
      typeof explanation === "string" && explanation.trim() ? explanation.trim() : null;
    const pageValue: number | null =
      typeof page === "number" && Number.isFinite(page) && page > 0 ? page : null;
    const sourceLabelValue: string | null =
      typeof sourceLabel === "string" && sourceLabel.trim() ? sourceLabel.trim() : null;

    const newQuestion: QuestionData = {
      id,
      number,
      ref: refValue,
      question: question.trim(),
      options: {
        a: options.a.trim(),
        b: options.b.trim(),
        c: options.c.trim(),
        d: options.d.trim(),
      },
      answer,
      explanation: explanationValue,
      page: pageValue,
      source,
      sourceLabel: sourceLabelValue,
    };

    await saveQuestion(newQuestion);
    return NextResponse.json({ question: newQuestion });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "新增失敗";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}