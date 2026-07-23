type KVClient = {
  get<T>(key: string): Promise<T | null>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  keys(pattern: string): Promise<string[]>;
  lpush(key: string, value: unknown): Promise<void>;
  lrange<T>(key: string, start: number, stop: number): Promise<T[]>;
  lrem(key: string, count: number, value: string): Promise<void>;
  sadd(key: string, member: string): Promise<void>;
  smembers(key: string): Promise<string[]>;
  srem(key: string, member: string): Promise<void>;
  hset(key: string, field: string, value: unknown): Promise<void>;
  hget<T>(key: string, field: string): Promise<T | null>;
  hgetall<T>(key: string): Promise<Record<string, T>>;
  hdel(key: string, field: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  rename(key: string, newKey: string): Promise<void>;
  expire(key: string, seconds: number): Promise<void>;
  createAttemptIfAbsent(record: AttemptRecord, attemptKey: string, indexKey: string): Promise<boolean>;
  ensureAttemptIndexed(attemptId: string, indexKey: string): Promise<void>;
};

const inMemoryStore = new Map<string, string>();

function createInMemoryClient(): KVClient {
  return {
    async get<T>(key: string): Promise<T | null> {
      const v = inMemoryStore.get(key);
      if (v === undefined) return null;
      return JSON.parse(v) as T;
    },
    async set(key: string, value: unknown): Promise<void> {
      inMemoryStore.set(key, JSON.stringify(value));
    },
    async del(key: string): Promise<void> {
      inMemoryStore.delete(key);
    },
    async keys(pattern: string): Promise<string[]> {
      const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
      return Array.from(inMemoryStore.keys()).filter((k) => regex.test(k));
    },
    async lpush(key: string, value: unknown): Promise<void> {
      const arr = await this.lrange<unknown>(key, 0, -1);
      arr.unshift(value);
      inMemoryStore.set(key, JSON.stringify(arr));
    },
    async lrange<T>(key: string, start: number, stop: number): Promise<T[]> {
      const v = inMemoryStore.get(key);
      if (!v) return [];
      const arr = JSON.parse(v) as T[];
      if (stop === -1) return arr.slice(start);
      return arr.slice(start, stop + 1);
    },
    async lrem(key: string, _count: number, value: string): Promise<void> {
      const v = inMemoryStore.get(key);
      if (!v) return;
      const arr = JSON.parse(v) as unknown[];
      inMemoryStore.set(key, JSON.stringify(arr.filter((x) => JSON.stringify(x) !== value)));
    },
    async sadd(key: string, member: string): Promise<void> {
      const set = new Set(await this.smembers(key));
      set.add(member);
      inMemoryStore.set(key, JSON.stringify(Array.from(set)));
    },
    async smembers(key: string): Promise<string[]> {
      const v = inMemoryStore.get(key);
      if (!v) return [];
      return JSON.parse(v) as string[];
    },
    async srem(key: string, member: string): Promise<void> {
      const set = new Set(await this.smembers(key));
      set.delete(member);
      inMemoryStore.set(key, JSON.stringify(Array.from(set)));
    },
    async hset(key: string, field: string, value: unknown): Promise<void> {
      const obj = await this.hgetall<unknown>(key);
      obj[field] = value;
      inMemoryStore.set(key, JSON.stringify(obj));
    },
    async hget<T>(key: string, field: string): Promise<T | null> {
      const obj = await this.hgetall<T>(key);
      return (obj[field] as T) ?? null;
    },
    async hgetall<T>(key: string): Promise<Record<string, T>> {
      const v = inMemoryStore.get(key);
      if (!v) return {};
      return JSON.parse(v) as Record<string, T>;
    },
    async hdel(key: string, field: string): Promise<void> {
      const obj = await this.hgetall(key);
      delete obj[field];
      inMemoryStore.set(key, JSON.stringify(obj));
    },
    async exists(key: string): Promise<boolean> {
      return inMemoryStore.has(key);
    },
    async rename(key: string, newKey: string): Promise<void> {
      const v = inMemoryStore.get(key);
      if (v !== undefined) {
        inMemoryStore.set(newKey, v);
        inMemoryStore.delete(key);
      }
    },
    async expire(_key: string, _seconds: number): Promise<void> {},
    async createAttemptIfAbsent(record: AttemptRecord, recordKey: string, indexKey: string) {
      if (inMemoryStore.has(recordKey)) return false;
      const rawIndex = inMemoryStore.get(indexKey);
      let ids: string[] = [];
      if (rawIndex) {
        try {
          const parsed = JSON.parse(rawIndex) as unknown;
          if (Array.isArray(parsed)) ids = parsed.filter((id): id is string => typeof id === "string");
        } catch {
          ids = [];
        }
      }
      inMemoryStore.set(recordKey, JSON.stringify(record));
      inMemoryStore.set(indexKey, JSON.stringify([record.id, ...ids.filter((id) => id !== record.id)]));
      return true;
    },
    async ensureAttemptIndexed(attemptId: string, indexKey: string) {
      const rawIndex = inMemoryStore.get(indexKey);
      let ids: string[] = [];
      if (rawIndex) {
        try {
          const parsed = JSON.parse(rawIndex) as unknown;
          if (Array.isArray(parsed)) ids = parsed.filter((id): id is string => typeof id === "string");
        } catch {
          ids = [];
        }
      }
      if (!ids.includes(attemptId)) {
        inMemoryStore.set(indexKey, JSON.stringify([attemptId, ...ids]));
      }
    },
  };
}

// 非 sqlite 後端:Vercel 上若配置了 KV/Upstash REST,走真正的远端 KV(持久化);
// 否则退回 in-memory(與 storage-backend 的 memory 兜底一致)。
// 用纯 fetch 调用 Upstash REST,Vercel KV 底层即 Upstash,同一套 API,无原生依赖,
// serverless 友好。(@vercel/kv 依賴已於 M4 卸載,這裡直接打 REST,見 storage-backend.ts 的 hasKvConfig)

function hasUpstashEnv(): boolean {
  return !!(
    (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
    (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  );
}

function createUpstashClient(): KVClient {
  const url =
    process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    "";
  const base = url.replace(/\/+$/, "");
  const headers = { Authorization: `Bearer ${token}` } as Record<string, string>;

  // Upstash REST:GET 形式即可执行所有命令;每个参数需 encodeURIComponent。
  async function exec<T>(...args: string[]): Promise<T> {
    const path = args.map((a) => encodeURIComponent(a)).join("/");
    const res = await fetch(`${base}/${path}`, { headers, cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Upstash REST ${res.status} on ${args[0]}`);
    }
    const json = (await res.json()) as { result: T };
    return json.result;
  }

  // 所有 key 的 value 统一以 JSON 字符串存储,与 createInMemoryClient 保持一致。
  const readJSON = async <T>(key: string): Promise<T | null> => {
    let raw: string | null;
    try {
      raw = await exec<string | null>("GET", key);
    } catch (e) {
      // 历史遗留:旧版 native 客户端(LPUSH/SADD/HSET)把部分 key 写成了
      // list/set/hash 原生类型,而本客户端用 GET(期望 JSON 字符串)读取会
      // 触发 Upstash "WRONGTYPE"。防御:直接视为空(null),后续写入会以
      // JSON 字符串 SET 重建该 key。绝不 DEL —— DEL 会在读一次时直接销毁
      // 用户数据(曾导致"打开页面数据消失")。存量错类型已由一次性
      // 迁移路由 /api/kvmig 处理,正常运行不会走到这里。
      if (e instanceof Error && /WRONGTYPE/i.test(e.message)) {
        return null;
      }
      throw e;
    }
    if (raw === null || raw === undefined) return null;
    return JSON.parse(raw) as T;
  };
  const writeJSON = async (key: string, value: unknown): Promise<void> => {
    await exec("SET", key, JSON.stringify(value));
  };

  const CREATE_ATTEMPT_SCRIPT = `
local attemptKey = KEYS[1]
local indexKey = KEYS[2]
if redis.call('EXISTS', attemptKey) == 1 then return 0 end
local ids = {}
local raw = redis.call('GET', indexKey)
if raw then
  local ok, decoded = pcall(cjson.decode, raw)
  if ok and type(decoded) == 'table' then ids = decoded end
end
local nextIds = {ARGV[1]}
for _, id in ipairs(ids) do
  if id ~= ARGV[1] then table.insert(nextIds, id) end
end
redis.call('SET', attemptKey, ARGV[2])
redis.call('SET', indexKey, cjson.encode(nextIds))
return 1
`;
  const ENSURE_ATTEMPT_INDEXED_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
local ids = {}
if raw then
  local ok, decoded = pcall(cjson.decode, raw)
  if ok and type(decoded) == 'table' then ids = decoded end
end
for _, id in ipairs(ids) do
  if id == ARGV[1] then return 0 end
end
table.insert(ids, 1, ARGV[1])
redis.call('SET', KEYS[1], cjson.encode(ids))
return 1
`;

  return {
    async get<T>(key: string) {
      return readJSON<T>(key);
    },
    async set(key: string, value: unknown) {
      await writeJSON(key, value);
    },
    async del(key: string) {
      await exec("DEL", key);
    },
    async keys(pattern: string) {
      return (await exec<string[] | null>("KEYS", pattern)) ?? [];
    },
    async lpush(key: string, value: unknown) {
      const arr = (await readJSON<unknown[]>(key)) ?? [];
      arr.unshift(value);
      await writeJSON(key, arr);
    },
    async lrange<T>(key: string, start: number, stop: number) {
      const arr = (await readJSON<T[]>(key)) ?? [];
      if (stop === -1) return arr.slice(start);
      return arr.slice(start, stop + 1);
    },
    async lrem(key: string, _count: number, value: string) {
      const arr = (await readJSON<unknown[]>(key)) ?? [];
      await writeJSON(
        key,
        arr.filter((x) => JSON.stringify(x) !== value)
      );
    },
    async sadd(key: string, member: string) {
      const set = new Set(await this.smembers(key));
      set.add(member);
      await writeJSON(key, Array.from(set));
    },
    async smembers(key: string) {
      return (await readJSON<string[]>(key)) ?? [];
    },
    async srem(key: string, member: string) {
      const set = new Set(await this.smembers(key));
      set.delete(member);
      await writeJSON(key, Array.from(set));
    },
    async hset(key: string, field: string, value: unknown) {
      const obj = (await readJSON<Record<string, unknown>>(key)) ?? {};
      obj[field] = value;
      await writeJSON(key, obj);
    },
    async hget<T>(key: string, field: string) {
      const obj = await readJSON<Record<string, T>>(key);
      return obj ? ((obj[field] as T) ?? null) : null;
    },
    async hgetall<T>(key: string) {
      return (await readJSON<Record<string, T>>(key)) ?? {};
    },
    async hdel(key: string, field: string) {
      const obj = (await readJSON<Record<string, unknown>>(key)) ?? {};
      delete obj[field];
      await writeJSON(key, obj);
    },
    async exists(key: string) {
      const n = await exec<number>("EXISTS", key);
      return n > 0;
    },
    async rename(key: string, newKey: string) {
      await exec("RENAME", key, newKey);
    },
    async expire(key: string, seconds: number) {
      await exec("EXPIRE", key, String(seconds));
    },
    async createAttemptIfAbsent(record: AttemptRecord, recordKey: string, indexKey: string) {
      const result = await exec<number>(
        "EVAL",
        CREATE_ATTEMPT_SCRIPT,
        "2",
        recordKey,
        indexKey,
        record.id,
        JSON.stringify(record),
      );
      return result === 1;
    },
    async ensureAttemptIndexed(attemptId: string, indexKey: string) {
      await exec<number>("EVAL", ENSURE_ATTEMPT_INDEXED_SCRIPT, "1", indexKey, attemptId);
    },
  };
}

export const kv: KVClient = hasUpstashEnv()
  ? createUpstashClient()
  : createInMemoryClient();

import type { StorageBackend } from "@/lib/storage-backend";
import type { AutoAdvanceDelay } from "@/lib/auto-advance";
// 在顶层 import 一次 storage-backend,避免循环依赖问题(getPrisma -> lib/db -> 不会反向依赖 kv)
import { pickStorageBackend } from "@/lib/storage-backend";
import * as sqlite from "@/lib/kv-sqlite";

function backend(): StorageBackend {
  return pickStorageBackend();
}

export type AnswerRecord = {
  questionId: string;
  userAnswer: string;
  isCorrect: boolean;
  timeSpentMs: number | null;
  createdAt: string;
};

export type AttemptRecord = {
  id: string;
  sessionId: string;
  paperId: string;
  mode: string;
  source: string | null;
  startedAt: string;
  finishedAt: string | null;
  durationSec: number | null;
  totalQ: number;
  questionIds: string[];
  correct: number;
  answers: AnswerRecord[];
};

export type ToolCallRecord = {
  id: string;
  sessionId: string;
  toolName: string;
  requestHash: string;
  responseJson: string;
  createdAt: string;
};

export type FavoriteRecord = {
  questionId: string;
  createdAt: string;
};

export type NoteRecord = {
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type UserPreferencesRecord = {
  autoAdvanceDelayMs: AutoAdvanceDelay;
  updatedAt: string;
};

export type FeedbackCategory =
  | "question_error"
  | "answer_error"
  | "explanation_unclear"
  | "typo";

export type FeedbackRecord = {
  id: string;
  sessionId: string;
  questionId: string;
  paperCode: string;
  source: string;
  sourceLabel: string | null;
  number: number;
  ref: string | null;
  category: FeedbackCategory;
  description: string;
  userAnswer: string | null;
  userAgent: string;
  createdAt: string;
};

const AT = "attempt:";
const SESS_AT = "session:attempts:";
const SESS_FAV = "session:favs:";
const SESS_FAV_META = "session:favs-meta:";
const SESS_NOTES = "session:notes:";
const SESS_PREFS = "session:preferences:";
const TOOL_CALL = "tool-call:";
const FB = "feedback:";
const SESS_FB = "feedback:session:";

export function attemptKey(id: string) { return `${AT}${id}`; }
function sessAttemptsKey(sid: string) { return `${SESS_AT}${sid}`; }
function sessFavsKey(sid: string) { return `${SESS_FAV}${sid}`; }
function sessFavMetaKey(sid: string) { return `${SESS_FAV_META}${sid}`; }
function sessNotesKey(sid: string) { return `${SESS_NOTES}${sid}`; }
function sessPreferencesKey(sid: string) { return `${SESS_PREFS}${sid}`; }
function toolCallKey(sid: string, id: string) { return `${TOOL_CALL}${sid}:${id}`; }
function feedbackKey(id: string) { return `${FB}${id}`; }
function sessFeedbackKey(sid: string) { return `${SESS_FB}${sid}`; }

export async function createAttempt(record: AttemptRecord): Promise<void> {
  if (backend() === "sqlite") return sqlite.createAttemptSqlite(record);
  await kv.set(attemptKey(record.id), record);
  await kv.lpush(sessAttemptsKey(record.sessionId), record.id);
}

export async function createAttemptIfAbsent(record: AttemptRecord): Promise<boolean> {
  if (backend() === "sqlite") return sqlite.createAttemptIfAbsentSqlite(record);
  return kv.createAttemptIfAbsent(
    record,
    attemptKey(record.id),
    sessAttemptsKey(record.sessionId),
  );
}

export async function ensureAttemptIndexed(sessionId: string, attemptId: string): Promise<void> {
  if (backend() === "sqlite") return;
  await kv.ensureAttemptIndexed(attemptId, sessAttemptsKey(sessionId));
}

export async function getAttempt(id: string): Promise<AttemptRecord | null> {
  if (backend() === "sqlite") return sqlite.getAttemptSqlite(id);
  const attempt = await kv.get<AttemptRecord>(attemptKey(id));
  if (!attempt) return null;
  return {
    ...attempt,
    questionIds: Array.isArray(attempt.questionIds) ? attempt.questionIds : [],
    answers: Array.isArray(attempt.answers) ? attempt.answers : [],
  };
}

export async function getPaperCode(paperId: string): Promise<string | null> {
  if (backend() === "sqlite") return sqlite.getPaperCodeSqlite(paperId);
  return paperId || null;
}

export async function updateAttempt(id: string, data: Partial<AttemptRecord>): Promise<void> {
  if (backend() === "sqlite") return sqlite.updateAttemptSqlite(id, data);
  const existing = await getAttempt(id);
  if (!existing) return;
  await kv.set(attemptKey(id), { ...existing, ...data });
}

/**
 * 单题 upsert:SQLite 后端只更新对应 Answer 行,不影响其它题目。
 * KV/memory 仍以 attempt JSON 文档读改写,仅用于这些后端的兼容实现；
 * 跨请求并发一致性需要后续以 Redis Lua / 进程内锁单独加固。
 */
export async function upsertAnswerIfUnfinished(
  attemptId: string,
  answer: AnswerRecord
): Promise<"written" | "finished" | "missing"> {
  if (backend() === "sqlite") return sqlite.upsertAnswerIfUnfinishedSqlite(attemptId, answer);
  const existing = await getAttempt(attemptId);
  if (!existing) return "missing";
  if (existing.finishedAt) return "finished";
  const nextAnswers = existing.answers.filter((a) => a.questionId !== answer.questionId);
  nextAnswers.push(answer);
  await kv.set(attemptKey(attemptId), { ...existing, answers: nextAnswers });
  return "written";
}

export async function finishAttemptAtomically(
  attemptId: string,
  finishedAt: string,
): Promise<AttemptRecord | null> {
  if (backend() === "sqlite") return sqlite.finishAttemptAtomicallySqlite(attemptId, finishedAt);
  const existing = await getAttempt(attemptId);
  if (!existing || existing.finishedAt) return existing;
  const correct = existing.answers.filter((answer) => answer.isCorrect).length;
  const finalized = { ...existing, finishedAt, correct };
  await kv.set(attemptKey(attemptId), finalized);
  return finalized;
}

export async function upsertAnswer(
  attemptId: string,
  answer: AnswerRecord
): Promise<void> {
  const result = await upsertAnswerIfUnfinished(attemptId, answer);
  if (result === "missing") throw new Error(`Attempt 不存在: ${attemptId}`);
}

export async function findUnfinishedAttempt(sessionId: string, paperId?: string, source?: string): Promise<AttemptRecord | null> {
  if (backend() === "sqlite") return sqlite.findUnfinishedAttemptSqlite(sessionId, paperId, source);
  const ids = [...new Set(await kv.lrange<string>(sessAttemptsKey(sessionId), 0, -1))];
  for (const id of ids) {
    const at = await getAttempt(id);
    if (at && at.sessionId === sessionId && at.finishedAt == null) {
      if (paperId && at.paperId !== paperId) continue;
      if (source && at.source !== source) continue;
      return at;
    }
  }
  return null;
}

export async function listAttempts(sessionId: string): Promise<AttemptRecord[]> {
  if (backend() === "sqlite") return sqlite.listAttemptsSqlite(sessionId);
  const ids = [...new Set(await kv.lrange<string>(sessAttemptsKey(sessionId), 0, -1))];
  const results: AttemptRecord[] = [];
  for (const id of ids) {
    const at = await getAttempt(id);
    if (at && at.sessionId === sessionId) results.push(at);
  }
  return results;
}

export async function getToolCall(sessionId: string, id: string): Promise<ToolCallRecord | null> {
  if (backend() === "sqlite") return sqlite.getToolCallSqlite(sessionId, id);
  return kv.get<ToolCallRecord>(toolCallKey(sessionId, id));
}

export async function createToolCall(record: ToolCallRecord): Promise<boolean> {
  if (backend() === "sqlite") return sqlite.createToolCallSqlite(record);
  const key = toolCallKey(record.sessionId, record.id);
  if (await kv.exists(key)) return false;
  await kv.set(key, record);
  return true;
}

export async function addFavorite(sessionId: string, questionId: string): Promise<void> {
  if (backend() === "sqlite") return sqlite.addFavoriteSqlite(sessionId, questionId);
  await kv.sadd(sessFavsKey(sessionId), questionId);
  await kv.hset(sessFavMetaKey(sessionId), questionId, { createdAt: new Date().toISOString() });
}

export async function removeFavorite(sessionId: string, questionId: string): Promise<void> {
  if (backend() === "sqlite") return sqlite.removeFavoriteSqlite(sessionId, questionId);
  await kv.srem(sessFavsKey(sessionId), questionId);
  await kv.hdel(sessFavMetaKey(sessionId), questionId);
}

export async function listFavorites(sessionId: string): Promise<string[]> {
  if (backend() === "sqlite") return sqlite.listFavoritesSqlite(sessionId);
  return kv.smembers(sessFavsKey(sessionId));
}

export async function getFavoriteMeta(sessionId: string, questionId: string): Promise<{ createdAt: string } | null> {
  if (backend() === "sqlite") return sqlite.getFavoriteMetaSqlite(sessionId, questionId);
  return kv.hget<{ createdAt: string }>(sessFavMetaKey(sessionId), questionId);
}

export async function saveNote(sessionId: string, questionId: string, content: string): Promise<void> {
  if (backend() === "sqlite") return sqlite.saveNoteSqlite(sessionId, questionId, content);
  const existing = await kv.hget<NoteRecord>(sessNotesKey(sessionId), questionId);
  await kv.hset(sessNotesKey(sessionId), questionId, {
    content,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteNote(sessionId: string, questionId: string): Promise<void> {
  if (backend() === "sqlite") return sqlite.deleteNoteSqlite(sessionId, questionId);
  await kv.hdel(sessNotesKey(sessionId), questionId);
}

export async function getNote(sessionId: string, questionId: string): Promise<NoteRecord | null> {
  if (backend() === "sqlite") return sqlite.getNoteSqlite(sessionId, questionId);
  return kv.hget<NoteRecord>(sessNotesKey(sessionId), questionId);
}

export async function listNotes(sessionId: string, questionIds?: string[]): Promise<Record<string, NoteRecord>> {
  if (backend() === "sqlite") return sqlite.listNotesSqlite(sessionId, questionIds);
  const all = await kv.hgetall<NoteRecord>(sessNotesKey(sessionId));
  if (!questionIds) return all;
  const filtered: Record<string, NoteRecord> = {};
  for (const qid of questionIds) {
    if (all[qid]) filtered[qid] = all[qid];
  }
  return filtered;
}

export async function getPreferences(sessionId: string): Promise<UserPreferencesRecord | null> {
  if (backend() === "sqlite") return sqlite.getPreferencesSqlite(sessionId);
  return kv.get<UserPreferencesRecord>(sessPreferencesKey(sessionId));
}

export async function savePreferences(
  sessionId: string,
  preferences: UserPreferencesRecord
): Promise<void> {
  if (backend() === "sqlite") return sqlite.savePreferencesSqlite(sessionId, preferences);
  await kv.set(sessPreferencesKey(sessionId), preferences);
}

export async function migrateSession(fromSessionId: string, toSessionId: string): Promise<{ attempts: number; favorites: number; notes: number }> {
  if (backend() === "sqlite") return sqlite.migrateSessionSqlite(fromSessionId, toSessionId);
  const result = { attempts: 0, favorites: 0, notes: 0 };

  // 使用精確 key,避免 wildcard 誤匹配前綴相似的 session ID
  const fromAtKey = sessAttemptsKey(fromSessionId);
  const toAtKey = sessAttemptsKey(toSessionId);

  if (await kv.exists(fromAtKey)) {
    const ids = await kv.lrange<string>(fromAtKey, 0, -1);

    if (await kv.exists(toAtKey)) {
      const existingIds = new Set(await kv.lrange<string>(toAtKey, 0, -1));
      let merged = 0;
      for (const id of ids) {
        if (!existingIds.has(id)) {
          await kv.lpush(toAtKey, id);
          merged++;
        }
      }
      await kv.del(fromAtKey);
    } else {
      await kv.rename(fromAtKey, toAtKey);
    }

    // 更新 attempt 記錄內的 sessionId 為新 ID
    const allIds = await kv.lrange<string>(toAtKey, 0, -1);
    for (const id of allIds) {
      const at = await getAttempt(id);
      if (at && at.sessionId === fromSessionId) {
        await updateAttempt(id, { sessionId: toSessionId });
      }
    }

    result.attempts = ids.length;
  }

  const favIds = await listFavorites(fromSessionId);
  if (favIds.length > 0) {
    const toFavIds = new Set(await listFavorites(toSessionId));
    for (const qid of favIds) {
      if (!toFavIds.has(qid)) {
        await addFavorite(toSessionId, qid);
      }
    }
    await kv.del(sessFavsKey(fromSessionId));
    await kv.del(sessFavMetaKey(fromSessionId));
    result.favorites = favIds.length;
  }

  const notes = await listNotes(fromSessionId);
  if (Object.keys(notes).length > 0) {
    const toNotes = await listNotes(toSessionId);
    for (const [qid, note] of Object.entries(notes)) {
      if (!toNotes[qid]) {
        await saveNote(toSessionId, qid, note.content);
      }
    }
    await kv.del(sessNotesKey(fromSessionId));
    result.notes = Object.keys(notes).length;
  }

  const fromPreferences = await getPreferences(fromSessionId);
  if (fromPreferences) {
    const toPreferences = await getPreferences(toSessionId);
    if (!toPreferences) await savePreferences(toSessionId, fromPreferences);
    await kv.del(sessPreferencesKey(fromSessionId));
  }

  return result;
}

export async function createFeedback(rec: FeedbackRecord): Promise<void> {
  if (backend() === "sqlite") return sqlite.createFeedbackSqlite(rec);
  await kv.set(feedbackKey(rec.id), rec);
  await kv.lpush(sessFeedbackKey(rec.sessionId), rec.id);
}

export async function getFeedback(id: string): Promise<FeedbackRecord | null> {
  if (backend() === "sqlite") return sqlite.getFeedbackSqlite(id);
  return kv.get<FeedbackRecord>(feedbackKey(id));
}

export async function listFeedback(sessionId: string, limit = 100): Promise<FeedbackRecord[]> {
  if (backend() === "sqlite") return sqlite.listFeedbackSqlite(sessionId, limit);
  const ids = await kv.lrange<string>(sessFeedbackKey(sessionId), 0, limit - 1);
  const out: FeedbackRecord[] = [];
  for (const id of ids) {
    const r = await getFeedback(id);
    if (r) out.push(r);
  }
  return out;
}

export async function deleteFeedback(id: string): Promise<void> {
  if (backend() === "sqlite") return sqlite.deleteFeedbackSqlite(id);
  await kv.del(feedbackKey(id));
  // 不清理 session 列表裡的 id(避免 lrem JSON 比對問題),
  // 讀路徑統一走 get() 驗存在性,自然忽略 ghost id。
}

export async function listAllFeedback(limit = 100): Promise<FeedbackRecord[]> {
  if (backend() === "sqlite") return sqlite.listAllFeedbackSqlite(limit);
  // 枚舉所有 session 的 feedback id 列表,合並去重 + 排序。
  const sessionKeys = await kv.keys(`${SESS_FB}*`);
  const idSets = await Promise.all(
    sessionKeys.map((k) => kv.lrange<string>(k, 0, -1))
  );
  const idSet = new Set<string>();
  for (const arr of idSets) for (const id of arr) idSet.add(id);

  const details = await Promise.all(
    Array.from(idSet).map((id) => getFeedback(id))
  );
  const items = details.filter((d): d is FeedbackRecord => d !== null);
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return items.slice(0, limit);
}
