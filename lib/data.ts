import papersData from "@/data/papers.json";
import p1ExamRaw from "@/data/questions-p1-exam.json";
import p1MockRaw from "@/data/questions-p1-mock.json";
import p3ExamRaw from "@/data/questions-p3-exam.json";
import p3MockRaw from "@/data/questions-p3-mock.json";

export type PaperInfo = {
  id: string;
  code: string;
  name: string;
  total: number;
  bySource: { exam: number; mock: number };
};

export type QuestionData = {
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

type QuestionMap = Record<string, QuestionData[]>;

const p1Exam = p1ExamRaw as QuestionData[];
const p1Mock = p1MockRaw as QuestionData[];
const p3Exam = p3ExamRaw as QuestionData[];
const p3Mock = p3MockRaw as QuestionData[];

const questionsBySource: QuestionMap = {};
for (const q of [...p1Exam, ...p1Mock, ...p3Exam, ...p3Mock]) {
  const key = `${q.id.split("-")[0]}-${q.source}`;
  if (!questionsBySource[key]) questionsBySource[key] = [];
  questionsBySource[key].push(q);
}

const questionsById = new Map<string, QuestionData>();
for (const arr of Object.values(questionsBySource)) {
  for (const q of arr) {
    questionsById.set(q.id, q);
  }
}

// 同步导出(供 Vercel 静态路径 / 客户端组件直接使用,无 async 开销)
export function getPapers(): PaperInfo[] {
  return papersData as PaperInfo[];
}

export function getQuestions(
  paperCode: string,
  source: string,
  opts?: { shuffle?: boolean; limit?: number; offset?: number }
): QuestionData[] {
  const key = `${paperCode}-${source}`;
  let list = questionsBySource[key];
  if (!list) return [];

  let result = [...list];

  if (opts?.shuffle) {
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
  } else {
    result.sort((a, b) => a.number - b.number);
  }

  const offset = opts?.offset ?? 0;
  const limit = opts?.limit ?? result.length;

  return result.slice(offset, offset + limit);
}

export function getQuestionById(id: string): QuestionData | null {
  return questionsById.get(id) ?? null;
}

// async 适配层:sqlite/VPS/本地 dev 默认走 JSON(因为 JSON 已经是 Prisma seed 的源,
// 部署/seed 后两边一致;如果将来需要让 SQLite 作为权威源,可在 storage-backend
// 检测到 sqlite + 配置了 USE_DB_AS_SOURCE 时切换到 Prisma 查询)。
// 这里保留 async 形态,方便后续接 Prisma 读取而不改 API 路由签名。
export async function getPapersAsync(): Promise<PaperInfo[]> {
  return getPapers();
}

export async function getQuestionsAsync(
  paperCode: string,
  source: string,
  opts?: { shuffle?: boolean; limit?: number; offset?: number }
): Promise<QuestionData[]> {
  return getQuestions(paperCode, source, opts);
}

export async function getQuestionByIdAsync(id: string): Promise<QuestionData | null> {
  return getQuestionById(id);
}
