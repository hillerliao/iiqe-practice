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
  };
}

function createUpstashClient(): KVClient {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
  const { createClient } = require("@vercel/kv") as typeof import("@vercel/kv");
  const client = createClient({ url, token });
  return {
    async get<T>(key: string): Promise<T | null> {
      return client.get<T>(key);
    },
    async set(key: string, value: unknown): Promise<void> {
      await client.set(key, value);
    },
    async del(key: string): Promise<void> {
      await client.del(key);
    },
    async keys(pattern: string): Promise<string[]> {
      let cursor = 0;
      const all: string[] = [];
      do {
        const [next, keys] = await client.scan(cursor, { match: pattern, count: 100 });
        cursor = Number(next);
        all.push(...keys);
      } while (cursor !== 0);
      return all;
    },
    async lpush(key: string, value: unknown): Promise<void> {
      await client.lpush(key, value);
    },
    async lrange<T>(key: string, start: number, stop: number): Promise<T[]> {
      return client.lrange<T>(key, start, stop);
    },
    async lrem(key: string, count: number, value: string): Promise<void> {
      await client.lrem(key, count, value);
    },
    async sadd(key: string, member: string): Promise<void> {
      await client.sadd(key, member);
    },
    async smembers(key: string): Promise<string[]> {
      return client.smembers(key);
    },
    async srem(key: string, member: string): Promise<void> {
      await client.srem(key, member);
    },
    async hset(key: string, field: string, value: unknown): Promise<void> {
      await client.hset(key, { [field]: value });
    },
    async hget<T>(key: string, field: string): Promise<T | null> {
      return client.hget<T>(key, field);
    },
    async hgetall<T>(key: string): Promise<Record<string, T>> {
      const result = await client.hgetall(key);
      return (result ?? {}) as unknown as Record<string, T>;
    },
    async hdel(key: string, field: string): Promise<void> {
      await client.hdel(key, field);
    },
    async exists(key: string): Promise<boolean> {
      const r = await client.exists(key);
      return r === 1;
    },
    async rename(key: string, newKey: string): Promise<void> {
      const val = await client.get(key);
      if (val !== null) {
        await client.set(newKey, val);
        await client.del(key);
      }
    },
    async expire(key: string, seconds: number): Promise<void> {
      await client.expire(key, seconds);
    },
  };
}

const hasUpstash = !!(process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL);
export const kv: KVClient = hasUpstash ? createUpstashClient() : createInMemoryClient();

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
  correct: number;
  answers: AnswerRecord[];
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

const AT = "attempt:";
const SESS_AT = "session:attempts:";
const SESS_FAV = "session:favs:";
const SESS_FAV_META = "session:favs-meta:";
const SESS_NOTES = "session:notes:";

export function attemptKey(id: string) { return `${AT}${id}`; }
function sessAttemptsKey(sid: string) { return `${SESS_AT}${sid}`; }
function sessFavsKey(sid: string) { return `${SESS_FAV}${sid}`; }
function sessFavMetaKey(sid: string) { return `${SESS_FAV_META}${sid}`; }
function sessNotesKey(sid: string) { return `${SESS_NOTES}${sid}`; }

export async function createAttempt(record: AttemptRecord): Promise<void> {
  await kv.set(attemptKey(record.id), record);
  await kv.lpush(sessAttemptsKey(record.sessionId), record.id);
}

export async function getAttempt(id: string): Promise<AttemptRecord | null> {
  return kv.get<AttemptRecord>(attemptKey(id));
}

export async function updateAttempt(id: string, data: Partial<AttemptRecord>): Promise<void> {
  const existing = await getAttempt(id);
  if (!existing) return;
  await kv.set(attemptKey(id), { ...existing, ...data });
}

export async function findUnfinishedAttempt(sessionId: string, paperId?: string, source?: string): Promise<AttemptRecord | null> {
  const ids = await kv.lrange<string>(sessAttemptsKey(sessionId), 0, -1);
  for (const id of ids) {
    const at = await getAttempt(id);
    if (at && at.finishedAt == null) {
      if (paperId && at.paperId !== paperId) continue;
      if (source && at.source !== source) continue;
      return at;
    }
  }
  return null;
}

export async function listAttempts(sessionId: string): Promise<AttemptRecord[]> {
  const ids = await kv.lrange<string>(sessAttemptsKey(sessionId), 0, -1);
  const results: AttemptRecord[] = [];
  for (const id of ids) {
    const at = await getAttempt(id);
    if (at) results.push(at);
  }
  return results;
}

export async function addFavorite(sessionId: string, questionId: string): Promise<void> {
  await kv.sadd(sessFavsKey(sessionId), questionId);
  await kv.hset(sessFavMetaKey(sessionId), questionId, { createdAt: new Date().toISOString() });
}

export async function removeFavorite(sessionId: string, questionId: string): Promise<void> {
  await kv.srem(sessFavsKey(sessionId), questionId);
  await kv.hdel(sessFavMetaKey(sessionId), questionId);
}

export async function listFavorites(sessionId: string): Promise<string[]> {
  return kv.smembers(sessFavsKey(sessionId));
}

export async function getFavoriteMeta(sessionId: string, questionId: string): Promise<{ createdAt: string } | null> {
  return kv.hget<{ createdAt: string }>(sessFavMetaKey(sessionId), questionId);
}

export async function saveNote(sessionId: string, questionId: string, content: string): Promise<void> {
  const existing = await kv.hget<NoteRecord>(sessNotesKey(sessionId), questionId);
  await kv.hset(sessNotesKey(sessionId), questionId, {
    content,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteNote(sessionId: string, questionId: string): Promise<void> {
  await kv.hdel(sessNotesKey(sessionId), questionId);
}

export async function getNote(sessionId: string, questionId: string): Promise<NoteRecord | null> {
  return kv.hget<NoteRecord>(sessNotesKey(sessionId), questionId);
}

export async function listNotes(sessionId: string, questionIds?: string[]): Promise<Record<string, NoteRecord>> {
  const all = await kv.hgetall<NoteRecord>(sessNotesKey(sessionId));
  if (!questionIds) return all;
  const filtered: Record<string, NoteRecord> = {};
  for (const qid of questionIds) {
    if (all[qid]) filtered[qid] = all[qid];
  }
  return filtered;
}

export async function migrateSession(fromSessionId: string, toSessionId: string): Promise<{ attempts: number; favorites: number; notes: number }> {
  const result = { attempts: 0, favorites: 0, notes: 0 };

  const fromKeys = await kv.keys(`${SESS_AT}${fromSessionId}*`);
  const toKeys = new Set(await kv.keys(`${SESS_AT}${toSessionId}*`));

  for (const key of fromKeys) {
    const newKey = key.replace(fromSessionId, toSessionId);
    if (toKeys.has(newKey)) continue;
    await kv.rename(key, newKey);
    result.attempts++;
  }

  const favIds = await listFavorites(fromSessionId);
  const toFavIds = new Set(await listFavorites(toSessionId));
  for (const qid of favIds) {
    if (toFavIds.has(qid)) continue;
    await addFavorite(toSessionId, qid);
    result.favorites++;
  }
  await kv.del(sessFavsKey(fromSessionId));
  await kv.del(sessFavMetaKey(fromSessionId));

  const notes = await listNotes(fromSessionId);
  const toNotes = await listNotes(toSessionId);
  for (const [qid, note] of Object.entries(notes)) {
    if (toNotes[qid]) continue;
    await saveNote(toSessionId, qid, note.content);
    result.notes++;
  }
  await kv.del(sessNotesKey(fromSessionId));

  return result;
}
