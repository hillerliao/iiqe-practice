// 灌入題庫
// 1. 卷一真題(來自 ../.cache_paper1.json)
// 2. 卷一模擬題(來自 scripts/mock_p1.json)
// 3. 卷三真題(來自 ../_p3_clean.json,需欄位轉換)
// 4. 卷三模擬題(來自 scripts/mock_p3.json)
import "dotenv/config";
import * as fs from "node:fs";
import * as path from "node:path";
import { prisma } from "../lib/db";

type RawQuestion = {
  number?: number;
  ref?: string;
  question?: string;
  options?: Record<string, string> | Record<string, string>[];
  answer?: string;
  explanation?: string;
  page?: number;
  // legacy 格式欄位
  q?: number;
  stem?: string;
  opts?: string[];
  ans?: string;
};

type SourceData = {
  paperCode: string;
  source: "exam" | "mock";
  sourceLabel: string;
  data: RawQuestion[];
  legacyFormat?: boolean;
};

function optsArrayToObject(arr: string[]): Record<string, string> {
  // arr = ["a)代位", "b)近因", ...] → {a: "代位", b: "近因", ...}
  const out: Record<string, string> = {};
  for (const s of arr) {
    const m = s.match(/^([abcd])\)\s*(.*)$/);
    if (m) {
      out[m[1]] = m[2].trim();
    }
  }
  return out;
}

async function loadPaper(item: SourceData) {
  console.log(
    `\n== ${item.paperCode} ${item.source} (${item.sourceLabel}) == ${item.data.length} questions`
  );

  let paper = await prisma.paper.findUnique({ where: { code: item.paperCode } });
  if (!paper) {
    paper = await prisma.paper.create({
      data: {
        code: item.paperCode,
        name: item.paperCode === "P1" ? "卷一:保險原理及實務" : "卷三:長期保險",
      },
    });
  }

  // 刪除舊的同 source 資料(避免重複灌)
  await prisma.question.deleteMany({
    where: { paperId: paper.id, source: item.source },
  });

  const records: {
    paperId: string;
    number: number;
    ref: string;
    question: string;
    options: string;
    answer: string;
    explanation: string | null;
    page: number | null;
    source: string;
    sourceLabel: string | null;
  }[] = [];
  for (const q of item.data) {
    if (item.legacyFormat) {
      // _p3_clean.json 格式: q/stem/opts/ans
      const stem = q.stem?.trim() ?? "";
      const opts = Array.isArray(q.opts) ? optsArrayToObject(q.opts) : q.opts ?? {};
      records.push({
        paperId: paper.id,
        number: q.q,
        ref: q.ref ?? "",
        question: stem,
        options: JSON.stringify(opts),
        answer: (q.ans ?? "").toLowerCase(),
        explanation: null,
        page: null,
        source: item.source,
        sourceLabel: item.sourceLabel,
      });
    } else {
      // mock_*.json 或 .cache_paper1.json 格式: number/ref/question/options/answer
      const opts = typeof q.options === "string" ? q.options : JSON.stringify(q.options);
      records.push({
        paperId: paper.id,
        number: q.number,
        ref: q.ref ?? "",
        question: q.question ?? "",
        options: opts,
        answer: (q.answer ?? "").toLowerCase(),
        explanation: q.explanation ?? null,
        page: q.page ?? null,
        source: item.source,
        sourceLabel: item.sourceLabel,
      });
    }
  }

  // 批次建立(避免一次塞太多)
  const batch = 100;
  for (let i = 0; i < records.length; i += batch) {
    await prisma.question.createMany({
      data: records.slice(i, i + batch),
    });
  }
  console.log(`  -> inserted ${records.length} questions`);
}

async function main() {
  const ROOT = path.dirname(__dirname);
  const PARENT = path.dirname(ROOT);

  function readJsonIfExists(filePath: string): unknown[] | null {
    if (!fs.existsSync(filePath)) {
      console.warn(`  [跳過] 找不到資料檔: ${filePath}`);
      return null;
    }
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  }

  const sources: SourceData[] = [];

  const p1Exam = readJsonIfExists(path.join(PARENT, ".cache_paper1.json"));
  if (p1Exam) {
    sources.push({
      paperCode: "P1",
      source: "exam",
      sourceLabel: "2021年版",
      data: p1Exam as RawQuestion[],
    });
  }

  const p1Mock = readJsonIfExists(path.join(ROOT, "scripts/mock_p1.json"));
  if (p1Mock) {
    sources.push({
      paperCode: "P1",
      source: "mock",
      sourceLabel: "2025模擬試題",
      data: p1Mock as RawQuestion[],
    });
  }

  const p3Exam = readJsonIfExists(path.join(PARENT, "_p3_clean.json"));
  if (p3Exam) {
    sources.push({
      paperCode: "P3",
      source: "exam",
      sourceLabel: "2022年版",
      data: p3Exam as RawQuestion[],
      legacyFormat: true,
    });
  }

  const p3Mock = readJsonIfExists(path.join(ROOT, "scripts/mock_p3.json"));
  if (p3Mock) {
    sources.push({
      paperCode: "P3",
      source: "mock",
      sourceLabel: "2025模擬試題",
      data: p3Mock as RawQuestion[],
    });
  }

  if (sources.length === 0) {
    console.warn("沒有可載入的資料來源,結束 seed。");
    return;
  }

  for (const s of sources) {
    await loadPaper(s);
  }

  // 統計
  const papers = await prisma.paper.findMany({
    include: { _count: { select: { questions: true } } },
  });
  console.log("\n=== Summary ===");
  for (const p of papers) {
    console.log(`${p.code} ${p.name}: ${p._count.questions} questions total`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
