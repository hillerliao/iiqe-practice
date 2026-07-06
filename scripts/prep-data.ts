import * as fs from "node:fs";
import * as path from "node:path";

const SCRIPT_DIR = __dirname;
const ROOT = path.resolve(SCRIPT_DIR, "..");
const DATA_DIR = path.join(ROOT, "data");

type RawQuestion = {
  number?: number;
  ref?: string;
  question?: string;
  options?: Record<string, string> | Record<string, string>[];
  answer?: string;
  explanation?: string;
  page?: number;
  q?: number;
  stem?: string;
  opts?: string[];
  ans?: string;
};

type QuestionOut = {
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

function optsArrayToObject(arr: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const s of arr) {
    const m = s.match(/^([abcd])\)\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

function normalize(raw: RawQuestion[], paperCode: string, source: "exam" | "mock", sourceLabel: string, legacy = false): QuestionOut[] {
  const seen = new Map<string, number>();
  return raw.map((q, i) => {
    const num = legacy ? (q.q ?? i + 1) : (q.number ?? i + 1);
    let baseId = `${paperCode}-${source}-${num}`;
    const count = seen.get(baseId) ?? 0;
    if (count > 0) baseId = `${baseId}-${count}`;
    seen.set(baseId.replace(/-(\d+)$/, ""), count + 1);

    if (legacy) {
      const stem = q.stem?.trim() ?? "";
      const opts = Array.isArray(q.opts) ? optsArrayToObject(q.opts) : (q.opts ?? {});
      const ans = (q.ans ?? "").toLowerCase();
      return {
        id: baseId,
        number: num,
        ref: q.ref ?? "",
        question: stem,
        options: opts as Record<string, string>,
        answer: ans,
        explanation: null,
        page: null,
        source,
        sourceLabel,
      };
    }
    const opts = typeof q.options === "string" ? JSON.parse(q.options) : (q.options ?? {});
    const ans = (q.answer ?? "").toLowerCase();
    return {
      id: baseId,
      number: num,
      ref: q.ref ?? "",
      question: q.question ?? "",
      options: opts as Record<string, string>,
      answer: ans,
      explanation: q.explanation ?? null,
      page: q.page ?? null,
      source,
      sourceLabel,
    };
  });
}

function readIfExists(filePath: string): RawQuestion[] | null {
  if (!fs.existsSync(filePath)) {
    console.warn(`  [skip] not found: ${filePath}`);
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function main() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  const sources: { paperCode: string; questions: QuestionOut[] }[] = [];

  const PAPER_META: Record<string, { code: string; name: string }> = {
    P1: { code: "P1", name: "卷一:保險原理及實務" },
    P3: { code: "P3", name: "卷三:長期保險" },
  };

  const p1Exam = readIfExists(path.join(ROOT, ".cache_paper1.json"));
  if (p1Exam) {
    const qs = normalize(p1Exam, "P1", "exam", "2021年版");
    sources.push({ paperCode: "P1", questions: qs });
    fs.writeFileSync(path.join(DATA_DIR, "questions-p1-exam.json"), JSON.stringify(qs, null, 2), "utf-8");
    console.log(`  P1 exam: ${qs.length} questions`);
  }

  const p1Mock = readIfExists(path.join(ROOT, "scripts/mock_p1.json"));
  if (p1Mock) {
    const qs = normalize(p1Mock, "P1", "mock", "2025模擬試題");
    sources.push({ paperCode: "P1", questions: qs });
    fs.writeFileSync(path.join(DATA_DIR, "questions-p1-mock.json"), JSON.stringify(qs, null, 2), "utf-8");
    console.log(`  P1 mock: ${qs.length} questions`);
  }

  const p3Exam = readIfExists(path.join(ROOT, "_p3_clean.json"));
  if (p3Exam) {
    const qs = normalize(p3Exam, "P3", "exam", "2022年版", true);
    sources.push({ paperCode: "P3", questions: qs });
    fs.writeFileSync(path.join(DATA_DIR, "questions-p3-exam.json"), JSON.stringify(qs, null, 2), "utf-8");
    console.log(`  P3 exam: ${qs.length} questions`);
  }

  const p3Mock = readIfExists(path.join(ROOT, "scripts/mock_p3.json"));
  if (p3Mock) {
    const qs = normalize(p3Mock, "P3", "mock", "2025模擬試題");
    sources.push({ paperCode: "P3", questions: qs });
    fs.writeFileSync(path.join(DATA_DIR, "questions-p3-mock.json"), JSON.stringify(qs, null, 2), "utf-8");
    console.log(`  P3 mock: ${qs.length} questions`);
  }

  const paperAgg: Record<string, { exam: number; mock: number }> = {};
  for (const s of sources) {
    if (!paperAgg[s.paperCode]) paperAgg[s.paperCode] = { exam: 0, mock: 0 };
    for (const q of s.questions) {
      paperAgg[s.paperCode][q.source as "exam" | "mock"]++;
    }
  }

  const papers = Object.entries(PAPER_META)
    .filter(([code]) => paperAgg[code])
    .map(([code, meta]) => ({
      id: code,
      code: meta.code,
      name: meta.name,
      bySource: paperAgg[code],
      total: paperAgg[code].exam + paperAgg[code].mock,
    }));

  fs.writeFileSync(path.join(DATA_DIR, "papers.json"), JSON.stringify(papers, null, 2), "utf-8");
  const totalQs = sources.reduce((a, s) => a + s.questions.length, 0);
  console.log(`\nDone. ${papers.length} papers, ${totalQs} total questions.`);
}

main();
