/**
 * deploy-audit.ts
 *
 * 統計 prod.db 的關鍵表格列數,並寫成 JSON 與人眼易讀的 table 到 audit log 目錄。
 * 純唯讀:絕不寫 prod.db、不改 schema、不引入 Prisma(避免 schema 漂移時報告失準)。
 *
 * Usage:
 *   npx tsx scripts/deploy-audit.ts [phase] [out-dir]
 *
 *   phase   "pre"  (default) or "post". pure tag,記錄在 JSON 裡。
 *   out-dir 寫入審計記錄的位置。預設 $IIQE_AUDIT_DIR 或 /home/ecs-user/iiqe-audit。
 *
 * Output:
 *   <out-dir>/audit-YYYYMMDD-HHMMSS-<sha-prefix>.json  ← 結構化資料
 *   <out-dir>/audit-YYYYMMDD-HHMMSS-<sha-prefix>.txt   ← 人眼可讀的 table
 *
 * 設計目標:
 *  - 不引入 Prisma client:better-sqlite3 直接讀 SQLite,schema 變動也安全。
 *  - 表名清單用 PRAGMA 動態抓,不寫死。schema 不在這裡維護。
 *  - 拿 commit SHA prefix 從 $DEPLOY_SHA / git rev-parse 取,讓 pre & post 能配對。
 *
 * 已知依賴:
 *  - better-sqlite3 (VPS 與本機皆有)
 *  - tsx (已用於其他部署步驟)
 *  - 可讀取 $DATABASE_URL 或預設 file:./prisma/prod.db
 */
import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as path from "node:path";

const PHASE = (process.argv[2] ?? process.env.AUDIT_PHASE ?? "pre").toLowerCase();
const OUT_DIR =
  process.argv[3] ??
  process.env.IIQE_AUDIT_DIR ??
  "/home/ecs-user/iiqe-audit";

// 待審計的核心清單。即使 SQLite 用 PRAGMA 取了所有表名,我們仍只報告這些
// (例如排除 SQLite 內建的 sqlite_sequence、_prisma_migrations 之類)。
// 用前綴比對,容忍 schema 漂移下不破壞舊比對腳本。
const REPORTED_TABLES = ["Paper", "Question", "Attempt", "Answer", "Favorite", "Note", "Feedback"];
// per-session 行數明細,只列已知的 sessionId 前綴,避免永無止境地膨脹。
const SESSION_PREFIXES = ["user:", "verify-", "custom:"];

const DB_URL = process.env.DATABASE_URL ?? "file:./prisma/prod.db";
const DB_PATH = DB_URL.startsWith("file:") ? DB_URL.slice(5) : DB_URL;

const SHA = (process.env.DEPLOY_SHA ?? "").trim() || tryGitRevParse() || "manual";
const SHA_TAG = SHA.slice(0, 12);

function tryGitRevParse(): string {
  try {
    const out = require("node:child_process")
      .execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    return out;
  } catch {
    return "";
  }
}

function tableNames(sql: Database.Database): string[] {
  const rows = sql
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[];
  return rows.map((r) => r.name);
}

function countTable(sql: Database.Database, name: string): number {
  try {
    const row = sql.prepare(`SELECT COUNT(*) AS c FROM "${name}"`).get() as { c: number };
    return row.c;
  } catch {
    return 0;
  }
}

function perSessionCounts(sql: Database.Database, table: string): Record<string, number> {
  // 用 SELECT 0 避免 schema 不存在時炸;若 sessionId 不在該表上,先嘗試常見列名。
  const candidateCols = ["sessionId", "userId", "ownerId"];
  for (const col of candidateCols) {
    try {
      const stmt = sql.prepare(`SELECT "${col}" AS sid, COUNT(*) AS c FROM "${table}" GROUP BY "${col}"`);
      const rows = stmt.all() as { sid: string | null; c: number }[];
      const out: Record<string, number> = {};
      for (const { sid, c } of rows) {
        if (sid == null) continue;
        const s = String(sid);
        const matched = SESSION_PREFIXES.some((p) => s.startsWith(p)) || /^[0-9a-f-]{36}$/.test(s);
        if (matched) out[s] = c;
      }
      if (Object.keys(out).length > 0) return out;
    } catch {
      // try next column name
    }
  }
  return {};
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  if (!fs.existsSync(DB_PATH)) {
    console.error(`[audit] prod.db not found at ${DB_PATH} (DATABASE_URL=${DB_URL})`);
    process.exit(1);
  }

  const sql = new Database(DB_PATH, { readonly: true, fileMustExist: true });

  let allTableNames: string[];
  try {
    allTableNames = tableNames(sql);
  } finally {
    sql.close();
  }

  const reported = REPORTED_TABLES.filter((t) => allTableNames.includes(t));

  // 每個 session 的明細(只對 Attempt / Answer 兩個最敏感的跑)
  const sql2 = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  const perSession: Record<string, Record<string, Record<string, number>>> = {};
  for (const t of reported) {
    perSession[t] = perSessionCounts(sql2, t);
  }
  sql2.close();

  // 各表 row count
  const sql3 = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  const counts: Record<string, number> = {};
  for (const t of reported) {
    counts[t] = countTable(sql3, t);
  }
  const totalRows = Object.values(counts).reduce((a, b) => a + b, 0);
  const allTables = allTableNames.length;
  sql3.close();

  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, "-").replace(/-\d{3}Z$/, "Z");

  const record = {
    phase: PHASE,
    sha: SHA,
    shaTag: SHA_TAG,
    timestamp: ts,
    dbPath: DB_PATH,
    dbTables: allTables,
    counts,
    perSession,
  };

  const base = `audit-${ts.replace(/[T]/, "T").slice(0, 16)}-${SHA_TAG}-${PHASE}`;
  const jsonPath = path.join(OUT_DIR, `${base}.json`);
  const txtPath = path.join(OUT_DIR, `${base}.txt`);

  fs.writeFileSync(jsonPath, JSON.stringify(record, null, 2));

  // 人眼可讀格式
  const lines: string[] = [];
  lines.push(`IIQE deploy audit`);
  lines.push(`  phase:    ${PHASE}`);
  lines.push(`  sha:      ${SHA} (${SHA_TAG})`);
  lines.push(`  at:       ${ts}`);
  lines.push(`  db:       ${DB_PATH} (${allTables} tables)`);
  lines.push("");
  lines.push(`Counts of REPORTED tables:`);
  for (const t of reported) {
    lines.push(`  ${t.padEnd(12)} ${counts[t]}`);
  }
  lines.push(`  ${"TOTAL".padEnd(12)} ${totalRows}`);
  lines.push("");
  const sessionsSeen = new Set<string>();
  for (const t of reported) {
    for (const s of Object.keys(perSession[t] ?? {})) sessionsSeen.add(s);
  }
  if (sessionsSeen.size) {
    lines.push(`Per-session breakdown:`);
    const sorted = [...sessionsSeen].sort();
    for (const sid of sorted) {
      lines.push(`  ${sid}`);
      for (const t of reported) {
        const v = perSession[t]?.[sid];
        if (v) lines.push(`    ${t.padEnd(10)} ${v}`);
      }
    }
  } else {
    lines.push(`Per-session breakdown: (none recorded yet)`);
  }
  fs.writeFileSync(txtPath, lines.join("\n") + "\n");

  // 同時 stdout(讓 deploy-remote.sh 直接看到)
  console.log(lines.join("\n"));
  console.log("");
  console.log(`[audit] written: ${jsonPath}`);
  console.log(`[audit] written: ${txtPath}`);

  // 寫到 $IIQE_AUDIT_LAST 路徑,讓 post-flight 比對時找得到對應的 pre
  const last = path.join(OUT_DIR, "last.json");
  if (PHASE === "pre") {
    fs.writeFileSync(last, JSON.stringify(record, null, 2));
    console.log(`[audit] pre-snapshot cached at ${last}`);
  } else if (PHASE === "post") {
    const prePath = process.env.IIQE_AUDIT_LAST ?? last;
    if (fs.existsSync(prePath)) {
      const pre = JSON.parse(fs.readFileSync(prePath, "utf8")) as typeof record;
      console.log("");
      console.log(`[audit] === diff pre(${pre.timestamp}) → post(${ts}) ===`);
      for (const t of reported) {
        const a = pre.counts[t] ?? 0;
        const b = record.counts[t] ?? 0;
        const d = b - a;
        const mark = d === 0 ? "=" : d > 0 ? "+" : "-";
        console.log(`  ${t.padEnd(12)} ${a} → ${b} (${mark}${Math.abs(d)})`);
      }
      // per-session 增量
      const beforeSess = new Set(Object.keys(pre.perSession.Attempt ?? {}));
      const afterSess = new Set(Object.keys(record.perSession.Attempt ?? {}));
      const newSess = [...afterSess].filter((s) => !beforeSess.has(s));
      if (newSess.length > 0) {
        console.log(`  new sessions: ${newSess.join(", ")}`);
      }
    } else {
      console.log(`[audit] WARN: no pre-snapshot found at ${prePath}; skipping diff`);
    }
  }
}

main();
