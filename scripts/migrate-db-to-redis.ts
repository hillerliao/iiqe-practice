// @ts-nocheck
import "dotenv/config";
import { DatabaseSync } from "node:sqlite";
import { createClient } from "@vercel/kv";
import type { AttemptRecord, AnswerRecord, NoteRecord } from "../lib/kv";

const DB_PATH = process.env.DB_PATH ?? "dev.db";
const KV_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

if (!KV_URL || !KV_TOKEN) {
  console.error("請設定 KV_REST_API_URL 和 KV_REST_API_TOKEN 環境變數");
  process.exit(1);
}

const db = new DatabaseSync(DB_PATH);
const kv = createClient({ url: KV_URL, token: KV_TOKEN });

// 1. Build paperId → paperCode mapping
const papers = db.prepare("SELECT id, code FROM Paper").all() as { id: string; code: string }[];
const paperCodeMap = new Map(papers.map((p) => [p.id, p.code]));

// 2. Build questionId → newId mapping
const questions = db.prepare("SELECT id, paperId, number, source FROM Question").all() as {
  id: string; paperId: string; number: number; source: string;
}[];
const qidMap = new Map<string, string>();
for (const q of questions) {
  const code = paperCodeMap.get(q.paperId);
  if (code) {
    qidMap.set(q.id, `${code}-${q.source}-${q.number}`);
  }
}

async function main() {
// 3. Migrate Attempts + Answers
const attempts = db.prepare("SELECT * FROM Attempt ORDER BY startedAt ASC").all() as any[];
let migratedAttempts = 0;
let migratedAnswers = 0;

for (const at of attempts) {
  const paperCode = paperCodeMap.get(at.paperId);
  if (!paperCode) continue;

  const answers = db
    .prepare("SELECT * FROM Answer WHERE attemptId = ? ORDER BY createdAt ASC")
    .all(at.id) as any[];

  const answerRecords: AnswerRecord[] = [];
  for (const ans of answers) {
    const newQid = qidMap.get(ans.questionId);
    if (!newQid) continue;
    answerRecords.push({
      questionId: newQid,
      userAnswer: ans.userAnswer ?? "",
      isCorrect: ans.isCorrect === 1,
      timeSpentMs: ans.timeSpentMs ?? null,
      createdAt: ans.createdAt ?? at.startedAt,
    });
    migratedAnswers++;
  }

  const record: AttemptRecord = {
    id: at.id,
    sessionId: at.sessionId,
    paperId: paperCode,
    mode: at.mode,
    source: at.source,
    startedAt: at.startedAt,
    finishedAt: at.finishedAt ?? null,
    durationSec: at.durationSec ?? null,
    totalQ: at.totalQ,
    correct: at.correct ?? answerRecords.filter((a) => a.isCorrect).length,
    answers: answerRecords,
  };

  await kv.set(`attempt:${at.id}`, record);
  await kv.lpush(`session:attempts:${at.sessionId}`, at.id);
  migratedAttempts++;
}

// 4. Migrate Favorites
const favs = db.prepare("SELECT sessionId, questionId, createdAt FROM Favorite").all() as any[];
const favSessions = new Set<string>();
for (const f of favs) {
  const newQid = qidMap.get(f.questionId);
  if (!newQid) continue;
  await kv.sadd(`session:favs:${f.sessionId}`, newQid);
  await kv.hset(`session:favs-meta:${f.sessionId}`, newQid, { createdAt: f.createdAt ?? new Date().toISOString() });
  favSessions.add(f.sessionId);
}

// 5. Migrate Notes (check if table exists)
let migratedNotes = 0;
try {
  const notes = db.prepare("SELECT sessionId, questionId, content, createdAt, updatedAt FROM Note").all() as any[];
  for (const n of notes) {
    const newQid = qidMap.get(n.questionId);
    if (!newQid) continue;
    const note: NoteRecord = {
      content: n.content,
      createdAt: n.createdAt ?? new Date().toISOString(),
      updatedAt: n.updatedAt ?? new Date().toISOString(),
    };
    await kv.hset(`session:notes:${n.sessionId}`, newQid, note);
    migratedNotes++;
  }
} catch {
  // Note table might not exist
}

db.close();

console.log(`遷移完成:
  Attempts: ${migratedAttempts}
  Answers:  ${migratedAnswers}
  Favorites: ${favs.length} (${favSessions.size} sessions)
  Notes:    ${migratedNotes}
`);
}

main().catch((e) => {
  console.error("遷移失敗:", e);
  process.exit(1);
});
