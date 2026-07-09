// Seed SQLite from data/*.json — idempotent upsert.
//
// 目的:VPS / 本地默认走 Prisma + SQLite 时,需要在部署或 db:push 后把静态题库
// (data/papers.json + data/questions-*.json) 写入 Paper/Question 表。
// 运行方式: pnpm db:seed  (等价 tsx prisma/seed.ts)
//
// 设计要点:
// 1. 幂等:同一个 JSON 反复 seed 不会产生重复行(Paper 用 id 唯一,Question 用 id 唯一)
// 2. 顺序:先 upsert Paper(Question 有 FK),再 upsert Question
// 3. 跳过非 SQLite 模式:如果 backend 不是 sqlite,直接退出(避免误把数据写到内存/Upstash)
//
// 注意:本文件不直接调用 lib/kv.ts,避免触发 lib/storage-backend 启动时的不必要初始化;
// 它只在 Prisma SQLite 路径上才有意义,所以硬性要求 backend === "sqlite"。

import papersData from "@/data/papers.json";
import p1ExamRaw from "@/data/questions-p1-exam.json";
import p1MockRaw from "@/data/questions-p1-mock.json";
import p3ExamRaw from "@/data/questions-p3-exam.json";
import p3MockRaw from "@/data/questions-p3-mock.json";

import { getPrisma, resetPrisma } from "@/lib/db";
import { describeBackend } from "@/lib/storage-backend";

type PaperSeed = {
  id: string;
  code: string;
  name: string;
  bySource: { exam: number; mock: number };
  total: number;
};

type QuestionSeed = {
  id: string;
  number: number;
  ref: string | null;
  question: string;
  options: Record<string, string>;
  answer: string;
  explanation: string | null;
  page: number | null;
  source: string;
  sourceLabel: string | null;
};

// Prisma 7 typegen 把 schema 的 `ref String?` 视为 non-null in update input
// (`Prisma.StringFieldUpdateOperationsInput | string`)。为兼容 client 类型,
// 我们用空串占位表示"无引用"——空串与 JSON 里的 null/ref=null 在语义上等价。
function refToString(ref: string | null | undefined): string {
  return ref ?? "";
}

function nullableToString(v: string | null | undefined): string {
  return v ?? "";
}

async function upsertPapers(papers: PaperSeed[]): Promise<{ count: number; paperIdByCode: Map<string, string> }> {
  const prisma = getPrisma();
  const paperIdByCode = new Map<string, string>();
  let count = 0;
  for (const p of papers) {
    const paper = await prisma.paper.upsert({
      where: { code: p.code },
      create: { id: p.id, code: p.code, name: p.name },
      update: { name: p.name },
    });
    paperIdByCode.set(p.code, paper.id);
    count++;
  }
  return { count, paperIdByCode };
}

async function upsertQuestions(
  questions: QuestionSeed[],
  paperIdByCode: Map<string, string>
): Promise<number> {
  const prisma = getPrisma();
  let n = 0;
  for (const q of questions) {
    // options 必须是 string(JSON 序列化),与 schema.options: String 一致
    const optionsJson = JSON.stringify(q.options ?? {});
    const paperCode = q.id.split("-")[0] || "UNKNOWN";
    const paperId = paperIdByCode.get(paperCode) ?? paperCode;
    await prisma.question.upsert({
      where: { id: q.id },
      create: {
        id: q.id,
        paperId,
        number: q.number,
        ref: refToString(q.ref),
        question: q.question,
        options: optionsJson,
        answer: q.answer,
        explanation: q.explanation,
        page: q.page,
        source: q.source,
        sourceLabel: nullableToString(q.sourceLabel),
      },
      update: {
        paperId,
        number: q.number,
        ref: refToString(q.ref),
        question: q.question,
        options: optionsJson,
        answer: q.answer,
        explanation: q.explanation,
        page: q.page,
        source: q.source,
        sourceLabel: nullableToString(q.sourceLabel),
      },
    });
    n++;
  }
  return n;
}

async function main(): Promise<void> {
  const info = describeBackend();
  // 关键守门:只允许在 sqlite backend 跑 seed,
  // 避免有人误在 Vercel KV / memory 路径上调用本脚本导致数据错位。
  if (info.backend !== "sqlite") {
    console.error(
      `[seed] backend=${info.backend}; this script only runs when STORAGE_BACKEND=sqlite or DATABASE_URL is set. Aborting.`,
    );
    process.exitCode = 1;
    await resetPrisma();
    return;
  }

  const papers = papersData as PaperSeed[];
  const questions: QuestionSeed[] = [
    ...(p1ExamRaw as QuestionSeed[]),
    ...(p1MockRaw as QuestionSeed[]),
    ...(p3ExamRaw as QuestionSeed[]),
    ...(p3MockRaw as QuestionSeed[]),
  ];

  const { count: paperCount, paperIdByCode } = await upsertPapers(papers);
  const questionCount = await upsertQuestions(questions, paperIdByCode);

  const prisma = getPrisma();
  const dbPaperCount = await prisma.paper.count();
  const dbQuestionCount = await prisma.question.count();

  console.log(
    `[seed] backend=${info.backend} db=${info.databaseUrlSet ? "configured" : "unset"} papers=${paperCount}(db=${dbPaperCount}) questions=${questionCount}(db=${dbQuestionCount})`,
  );


  await resetPrisma();
}

main().catch(async (e) => {
  console.error("[seed] failed:", e);
  await resetPrisma();
  process.exit(1);
});
