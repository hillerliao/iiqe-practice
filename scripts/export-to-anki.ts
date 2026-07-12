import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ANKI_URL = process.env.ANKI_URL ?? "http://127.0.0.1:8765";
const API_KEY = process.env.ANKI_KEY ?? "anki-liao";

type AnkiResponse<T> = { result: T; error: string | null };

async function anki<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(ANKI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, version: 6, key: API_KEY, params }),
  });
  const json = (await res.json()) as AnkiResponse<T>;
  if (json.error) throw new Error(`AnkiConnect [${action}]: ${json.error}`);
  return json.result;
}

type QuestionData = {
  id: string;
  number: number;
  ref: string;
  question: string;
  options: Record<string, string>;
  answer: string;
  explanation: string | null;
  page: number | null;
  source: string;
  sourceLabel: string | null;
};

type SourceKey = "P1-exam" | "P1-mock" | "P3-exam" | "P3-mock";

const SOURCE_FILES: Record<SourceKey, string> = {
  "P1-exam": "data/questions-p1-exam.json",
  "P1-mock": "data/questions-p1-mock.json",
  "P3-exam": "data/questions-p3-exam.json",
  "P3-mock": "data/questions-p3-mock.json",
};

const DECK_NAMES: Record<SourceKey, string> = {
  "P1-exam": "IIQE::P1::exam-2021",
  "P1-mock": "IIQE::P1::mock-2025",
  "P3-exam": "IIQE::P3::exam-2022",
  "P3-mock": "IIQE::P3::mock-2025",
};

const MODEL_NAME = "IIQE-MCQ";

const MODEL_CSS = `
.card { font-family: -apple-system, "PingFang TC", "Microsoft JhengHei", "Helvetica Neue", sans-serif; font-size: 18px; color: #1f2937; background: #fff; padding: 20px; line-height: 1.6; }
.qtext { font-size: 19px; font-weight: 500; margin-bottom: 14px; }
.options { margin-top: 12px; }
.option { display: block; padding: 8px 12px; margin: 5px 0; border-radius: 6px; background: #f4f4f5; border: 1px solid #e5e7eb; }
.correct { background: #d1fae5; color: #065f46; font-weight: 600; border-color: #6ee7b7; }
.explain { margin-top: 14px; padding: 10px 12px; background: #fffbeb; border-left: 3px solid #f59e0b; border-radius: 4px; font-size: 16px; }
.meta { margin-top: 16px; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 8px; }
.tag { display: inline-block; padding: 2px 8px; margin-right: 4px; border-radius: 999px; background: #eef2ff; color: #4338ca; font-size: 11px; }
hr#answer { border: none; border-top: 1px dashed #d4d4d8; margin: 16px 0; }
`;

const MODEL_FRONT = `<div class="card"><div class="qtext">{{Question}}</div><div class="options"><div class="option">{{OptionA}}</div><div class="option">{{OptionB}}</div><div class="option">{{OptionC}}</div><div class="option">{{OptionD}}</div></div></div>`;

const MODEL_BACK = `{{FrontSide}}<hr id="answer"><div class="card"><div class="option correct">✓ {{AnswerLetter}}. {{AnswerText}}</div>{{#Explanation}}<div class="explain"><b>解析：</b>{{Explanation}}</div>{{/Explanation}}<div class="meta"><span class="tag">{{Ref}}</span><span class="tag">{{Source}}</span><span class="tag">id: {{QuestionID}}</span></div></div>`;

const MODEL_DEFINITION = {
  modelName: MODEL_NAME,
  inOrderFields: [
    "Question",
    "OptionA",
    "OptionB",
    "OptionC",
    "OptionD",
    "AnswerLetter",
    "AnswerText",
    "Explanation",
    "Ref",
    "Source",
    "QuestionID",
  ],
  css: MODEL_CSS,
  cardTemplates: [{ Name: "IIQE MCQ", Front: MODEL_FRONT, Back: MODEL_BACK }],
};

type Args = {
  only?: SourceKey[];
  dryRun: boolean;
  skipExisting: boolean;
};

function parseArgs(): Args {
  const args: Args = { dryRun: false, skipExisting: true };
  for (const arg of process.argv.slice(2)) {
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--no-skip") args.skipExisting = false;
    else if (arg.startsWith("--only=")) {
      const value = arg.slice("--only=".length);
      const keys = value.split(",").map((s) => s.trim()) as SourceKey[];
      const valid = keys.filter((k) => k in SOURCE_FILES);
      if (valid.length === 0) {
        console.error(`無效的 --only 值: ${value}。可用: ${Object.keys(SOURCE_FILES).join(", ")}`);
        process.exit(1);
      }
      args.only = valid;
    } else if (arg === "--help" || arg === "-h") {
      console.log(`用法: npx tsx scripts/export-to-anki.ts [選項]

選項:
  --only=P1-exam,P3-mock   只匯入指定來源 (可多選，逗號分隔)
  --no-skip                 不跳過 Anki 中已存在的題目（強制重建）
  --dry-run                 只列出將匯入的題數，不實際呼叫 AnkiConnect
  -h, --help                顯示此說明

環境變數:
  ANKI_URL    AnkiConnect 網址 (預設 http://127.0.0.1:8765)
  ANKI_KEY    AnkiConnect API key (預設 anki-liao)
`);
      process.exit(0);
    } else {
      console.error(`未知參數: ${arg}`);
      process.exit(1);
    }
  }
  return args;
}

function loadQuestions(key: SourceKey): QuestionData[] {
  const path = resolve(process.cwd(), SOURCE_FILES[key]);
  return JSON.parse(readFileSync(path, "utf-8")) as QuestionData[];
}

function buildNote(q: QuestionData, deckName: string) {
  const opts = q.options ?? {};
  const letter = q.answer?.toUpperCase();
  const answerText = opts[letter.toLowerCase()] ?? "";
  return {
    deckName,
    modelName: MODEL_NAME,
    fields: {
      Question: q.question ?? "",
      OptionA: `A. ${opts.a ?? ""}`,
      OptionB: `B. ${opts.b ?? ""}`,
      OptionC: `C. ${opts.c ?? ""}`,
      OptionD: `D. ${opts.d ?? ""}`,
      AnswerLetter: letter ?? "",
      AnswerText: answerText,
      Explanation: q.explanation ?? "",
      Ref: q.ref ?? "",
      Source: q.sourceLabel ?? q.source ?? "",
      QuestionID: q.id ?? "",
    },
    tags: [
      "IIQE",
      `paper:${q.id?.split("-")[0] ?? ""}`,
      `source:${q.source ?? ""}`,
      q.ref ? `ref:${q.ref}` : "ref:none",
      `qid:${q.id ?? ""}`,
    ],
  };
}

async function ensureModel() {
  const models = await anki<string[]>("modelNames");
  if (!models.includes(MODEL_NAME)) {
    console.log(`  建立 model: ${MODEL_NAME}`);
    await anki("createModel", MODEL_DEFINITION);
  }
}

async function ensureDeck(deckName: string) {
  const decks = await anki<string[]>("deckNames");
  if (!decks.includes(deckName)) {
    console.log(`  建立 deck: ${deckName}`);
    await anki("createDeck", { deck: deckName });
  }
}

async function getExistingIds(deckName: string): Promise<Set<string>> {
  const ids = await anki<number[]>("findNotes", { query: `deck:"${deckName}"` });
  if (ids.length === 0) return new Set();
  const fieldsPerNote = await anki<Record<string, Record<string, { value: string }>>>("notesInfo", { notes: ids });
  const set = new Set<string>();
  for (const info of Object.values(fieldsPerNote)) {
    const qid = info.QuestionID?.value;
    if (qid) set.add(qid);
  }
  return set;
}

async function importSource(key: SourceKey, args: Args) {
  const deckName = DECK_NAMES[key];
  console.log(`\n[${key}] -> ${deckName}`);

  const questions = loadQuestions(key);
  console.log(`  載入 ${questions.length} 題`);

  if (args.dryRun) {
    console.log(`  (dry-run) 將匯入 ${questions.length} 題，跳過實際呼叫`);
    return { total: questions.length, added: 0, skipped: 0, failed: 0 };
  }

  await ensureModel();
  await ensureDeck(deckName);

  const existing = args.skipExisting ? await getExistingIds(deckName) : new Set<string>();
  const toImport = questions.filter((q) => !existing.has(q.id ?? ""));
  console.log(`  已存在: ${existing.size}, 待匯入: ${toImport.length}`);

  let added = 0;
  let failed = 0;
  let dup = 0;
  const failures: { id: string; reason: string }[] = [];

  for (let i = 0; i < toImport.length; i++) {
    const q = toImport[i];
    try {
      const id = await anki<number | null>("addNote", { note: buildNote(q, deckName) });
      if (id === null || id === undefined) {
        dup++;
      } else {
        added++;
      }
    } catch (err) {
      failed++;
      const msg = err instanceof Error ? err.message : String(err);
      failures.push({ id: q.id, reason: msg });
    }
    if ((i + 1) % 25 === 0 || i === toImport.length - 1) {
      process.stdout.write(`\r  進度: ${i + 1}/${toImport.length}`);
    }
  }
  process.stdout.write("\n");

  if (failures.length > 0) {
    console.log(`  失敗 ${failures.length} 題，前 5 筆:`);
    for (const f of failures.slice(0, 5)) {
      console.log(`    - ${f.id}: ${f.reason}`);
    }
  }
  if (dup > 0) {
    console.log(`  重複略過: ${dup}`);
  }

  return { total: questions.length, added, skipped: existing.size, failed };
}

async function main() {
  const args = parseArgs();
  const targets = args.only ?? (Object.keys(SOURCE_FILES) as SourceKey[]);

  console.log(`AnkiConnect: ${ANKI_URL}`);
  if (args.dryRun) console.log("[DRY-RUN 模式]");

  const version = await anki<number>("version");
  console.log(`連線成功, AnkiConnect v${version}\n`);

  const summary: { key: SourceKey; total: number; added: number; skipped: number; failed: number }[] = [];
  for (const key of targets) {
    const r = await importSource(key, args);
    summary.push({ key, ...r });
  }

  console.log("\n========== 匯入完成 ==========");
  console.log("來源          總數      新增      已存在    失敗");
  for (const s of summary) {
    console.log(
      `${s.key.padEnd(12)} ${String(s.total).padEnd(10)} ${String(s.added).padEnd(10)} ${String(s.skipped).padEnd(10)} ${s.failed}`
    );
  }
  const totals = summary.reduce(
    (acc, s) => ({ total: acc.total + s.total, added: acc.added + s.added, skipped: acc.skipped + s.skipped, failed: acc.failed + s.failed }),
    { total: 0, added: 0, skipped: 0, failed: 0 }
  );
  console.log("─".repeat(50));
  console.log(
    `${"合計".padEnd(12)} ${String(totals.total).padEnd(10)} ${String(totals.added).padEnd(10)} ${String(totals.skipped).padEnd(10)} ${totals.failed}`
  );
}

main().catch((err) => {
  console.error("\n[錯誤]", err.message);
  process.exit(1);
});