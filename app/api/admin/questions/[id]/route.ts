// 管理員單題操作 API:
// - GET:   讀取最新題目(走 SQLite)
// - PATCH: 修改題目(雙寫 SQLite + JSON);id / number / paperCode / source 不可改

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { pickStorageBackend } from "@/lib/storage-backend";
import { saveQuestion, readQuestionLatest } from "@/lib/question-write";
import type { QuestionData } from "@/lib/data";

type OptionKey = "a" | "b" | "c" | "d";
const VALID_ANSWERS: ReadonlyArray<OptionKey> = ["a", "b", "c", "d"];

function isOptionKey(v: unknown): v is OptionKey {
  return typeof v === "string" && (VALID_ANSWERS as readonly string[]).includes(v);
}

function ensureWritable(): NextResponse | null {
  if (pickStorageBackend() !== "sqlite") {
    return NextResponse.json(
      { error: "當前部署不支持題目編輯(僅 SQLite 後端可寫)" },
      { status: 403 }
    );
  }
  return null;
}

export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/admin/questions/[id]">
) {
  const { id } = await ctx.params;
  const session = requireAdmin(req);
  if (session instanceof NextResponse) return session;

  const writableBlock = ensureWritable();
  if (writableBlock) return writableBlock;

  const q = await readQuestionLatest(id);
  if (!q) {
    return NextResponse.json({ error: "題目不存在" }, { status: 404 });
  }
  return NextResponse.json({ question: q });
}

export async function PATCH(
  req: NextRequest,
  ctx: RouteContext<"/api/admin/questions/[id]">
) {
  const { id } = await ctx.params;
  const session = requireAdmin(req);
  if (session instanceof NextResponse) return session;

  const writableBlock = ensureWritable();
  if (writableBlock) return writableBlock;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // 拒絕修改 id
  if (body && typeof body === "object" && "id" in body && body.id !== id) {
    return NextResponse.json(
      { error: "不允許修改題目 id(id 是主鍵,會破壞外鍵引用)" },
      { status: 400 }
    );
  }
  // 拒絕修改 number / source / paperCode(這些都在 id 中隱含)
  for (const field of ["number", "source", "paperCode"]) {
    if (field in (body ?? {})) {
      return NextResponse.json(
        { error: `不允許修改 ${field}(由 id 決定)` },
        { status: 400 }
      );
    }
  }

  // 讀現有
  const existing = await readQuestionLatest(id);
  if (!existing) {
    return NextResponse.json({ error: "題目不存在" }, { status: 404 });
  }

  // 構造更新後的題目(部分字段更新)
  const next: QuestionData = { ...existing };

  if ("ref" in body) {
    if (typeof body.ref !== "string") {
      return NextResponse.json({ error: "ref 必須是字串" }, { status: 400 });
    }
    next.ref = body.ref.trim();
  }
  if ("question" in body) {
    if (typeof body.question !== "string" || !body.question.trim()) {
      return NextResponse.json({ error: "question 必填且非空" }, { status: 400 });
    }
    next.question = body.question.trim();
  }
  if ("options" in body) {
    const opts = body.options;
    if (
      !opts ||
      typeof opts !== "object" ||
      Array.isArray(opts) ||
      !VALID_ANSWERS.every(
        (k) => typeof (opts as Record<string, unknown>)[k] === "string"
      )
    ) {
      return NextResponse.json(
        { error: "options 必須包含 a/b/c/d 四個字串" },
        { status: 400 }
      );
    }
    next.options = {
      a: (opts.a as string).trim(),
      b: (opts.b as string).trim(),
      c: (opts.c as string).trim(),
      d: (opts.d as string).trim(),
    };
  }
  if ("answer" in body) {
    if (!isOptionKey(body.answer)) {
      return NextResponse.json(
        { error: "answer 必須是 a/b/c/d 之一" },
        { status: 400 }
      );
    }
    next.answer = body.answer;
  }
  if ("explanation" in body) {
    if (body.explanation === null || body.explanation === "") {
      next.explanation = null;
    } else if (typeof body.explanation === "string") {
      next.explanation = body.explanation.trim() || null;
    } else {
      return NextResponse.json({ error: "explanation 必須是字串或 null" }, { status: 400 });
    }
  }
  if ("page" in body) {
    if (body.page === null || body.page === undefined || body.page === "") {
      next.page = null;
    } else if (typeof body.page === "number" && Number.isFinite(body.page) && body.page > 0) {
      next.page = body.page;
    } else {
      return NextResponse.json({ error: "page 必須是正整數或 null" }, { status: 400 });
    }
  }
  if ("sourceLabel" in body) {
    if (body.sourceLabel === null || body.sourceLabel === undefined || body.sourceLabel === "") {
      next.sourceLabel = null;
    } else if (typeof body.sourceLabel === "string") {
      next.sourceLabel = body.sourceLabel.trim() || null;
    } else {
      return NextResponse.json(
        { error: "sourceLabel 必須是字串或 null" },
        { status: 400 }
      );
    }
  }

  try {
    await saveQuestion(next);
    return NextResponse.json({ question: next });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "保存失敗";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}