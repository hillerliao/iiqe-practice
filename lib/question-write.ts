// 管理員編輯題目的寫入封裝:
// 1) SQLite 作為主存(運行時 admin API 直接讀 SQLite 看到最新);
// 2) JSON 作為快照(兜底,給所有走 lib/data.ts 的老 API 也能讀到最新;
//    同時作為 git 中的源文件,下次 pnpm db:seed 時回到 SQLite)。
//
// 兩邊同時寫入,任何一邊失敗都視為整體失敗(原子性):
// - SQLite 寫失敗 → 拋錯,JSON 不寫
// - JSON 寫失敗 → 拋錯,SQLite 已寫(理論上不會出現,除非磁盤只讀)
//
// 注意:此模塊只在 backend === "sqlite" 時被調用;上層 API route 已校驗。

import fs from "node:fs/promises";
import path from "node:path";
import {
  upsertQuestionSqlite,
  getQuestionSqlite,
} from "@/lib/kv-sqlite";
import { resolveMapping, type QuestionSource } from "@/lib/admin-question-meta";
import type { QuestionData } from "@/lib/data";
import { normalizeQuestionFields } from "@/lib/question-text";

/**
 * 寫入題目:SQLite 主存 + JSON 原子快照。
 * @throws 當前 backend 非 sqlite 時由上層校驗拋錯
 */
export async function saveQuestion(q: QuestionData): Promise<void> {
  const normalized = normalizeQuestionFields(q);
  // 1) SQLite 主存(必須先成功)
  await upsertQuestionSqlite(normalized);
  // 2) JSON 快照(原子寫)
  await persistToJson(normalized);
}

/**
 * 生成新題目的 id,基於當前 SQLite 已有題號自動取 max+1。
 * @throws 找不到對應 paperCode 時
 */
export async function allocateNextQuestionId(
  paperCode: string,
  source: QuestionSource
): Promise<{ id: string; number: number }> {
  const { getPrisma } = await import("@/lib/db");
  const prisma = getPrisma();
  const paper = await prisma.paper.findUnique({
    where: { code: paperCode },
    select: { id: true },
  });
  if (!paper) {
    throw new Error(`Paper 不存在: code=${paperCode}。請先在 papers.json 中定義此試卷。`);
  }
  const max = await prisma.question.findFirst({
    where: { paperId: paper.id, source },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const nextNumber = (max?.number ?? 0) + 1;
  return { id: `${paperCode}-${source}-${nextNumber}`, number: nextNumber };
}

/**
 * 讀取最新題目(走 SQLite)。給 admin API 用。
 */
export async function readQuestionLatest(id: string): Promise<QuestionData | null> {
  return getQuestionSqlite(id);
}

// ---------- JSON 原子寫 ----------

const DATA_DIRECTORY = path.join(process.cwd(), "data");

const QUESTION_JSON_FILES = {
  "P1:exam": "questions-p1-exam.json",
  "P1:mock": "questions-p1-mock.json",
  "P3:exam": "questions-p3-exam.json",
  "P3:mock": "questions-p3-mock.json",
} as const;

function resolveQuestionJsonPath(
  paperCode: string,
  source: QuestionSource
): string {
  const key = `${paperCode}:${source}` as keyof typeof QUESTION_JSON_FILES;
  const fileName = QUESTION_JSON_FILES[key];
  if (!fileName) {
    throw new Error(`沒有對應的 JSON 快照: paperCode=${paperCode}, source=${source}`);
  }
  return path.join(DATA_DIRECTORY, fileName);
}

async function persistToJson(q: QuestionData): Promise<void> {
  const mapping = resolveMapping(q);
  const fullPath = resolveQuestionJsonPath(mapping.paperCode, mapping.source);

  // 讀舊內容(讀不到則視為空數組,只對新增場景有意義——編輯場景必須存在)
  let arr: QuestionData[];
  try {
    const raw = await fs.readFile(fullPath, "utf8");
    arr = JSON.parse(raw) as QuestionData[];
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      arr = [];
    } else {
      throw new Error(
        `讀取 JSON 快照失敗: ${mapping.file}(${(e as Error).message})`
      );
    }
  }

  const idx = arr.findIndex((x) => x.id === q.id);
  if (idx >= 0) {
    arr[idx] = q;
  } else {
    arr.push(q);
    // 不強制排序,保留現有 mock 數據的留白編號(P3-mock-861/865 等)
  }

  // 原子寫:寫到 tmp,再 rename 替換(同一文件系統下 rename 是原子的)
  const tmpPath = `${fullPath}.${process.pid}.${Date.now()}.tmp`;
  const payload = JSON.stringify(arr, null, 2) + "\n";
  try {
    await fs.writeFile(tmpPath, payload, "utf8");
    await fs.rename(tmpPath, fullPath);
  } catch (e) {
    // 清理 tmp 殘留(若 rename 未成功)
    await fs.unlink(tmpPath).catch(() => undefined);
    throw new Error(
      `JSON 快照寫入失敗: ${mapping.file}(${(e as Error).message})`
    );
  }
}