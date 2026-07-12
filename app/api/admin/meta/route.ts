// 返回 admin 編輯所需的元信息:
// - backend 類型(sqlite / kv / memory)
// - writable: 是否支持題目編輯(只有 sqlite 後端支持)
// - papers: 試卷清單
//
// 不需要管理員權限即可讀(僅返回元信息,不洩露敏感數據);
// 但實際編輯操作需要 isAdmin 校驗。

import { NextResponse } from "next/server";
import { pickStorageBackend, type StorageBackend } from "@/lib/storage-backend";
import { getPapers } from "@/lib/data";

export async function GET() {
  const backend: StorageBackend = pickStorageBackend();
  const writable = backend === "sqlite";
  const papers = getPapers();
  return NextResponse.json({
    backend,
    writable,
    writableReason: writable
      ? null
      : "當前部署非 SQLite 後端,不支持題目編輯。請在 VPS / 本地 (DATABASE_URL 已配置) 操作。",
    papers: papers.map((p) => ({ id: p.id, code: p.code, name: p.name })),
  });
}