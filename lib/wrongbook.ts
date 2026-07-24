// 錯題本聚合邏輯:從作答紀錄(Attempt/Answer)派生錯題清單。
// 獨立於 route handler,方便以不同 Attempt 排序(KV 新→舊、SQLite 舊→新)驗證。
import type { AttemptRecord } from "@/lib/kv";
import type { PaperInfo, QuestionData } from "@/lib/data";

export type WrongbookItem = {
  questionId: string;
  userAnswer: string;
  correctAnswer: string;
  lastWrongAt: string;
  wrongCount: number;
  paperCode: string;
  paperName: string;
  note: string | null;
  question: {
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
};

function wrongEventTime(
  attempt: AttemptRecord,
  answer: { createdAt?: string | null },
): string {
  return answer.createdAt || attempt.finishedAt || attempt.startedAt;
}

export function buildWrongbookItems(
  attempts: AttemptRecord[],
  getQuestionById: (id: string) => QuestionData | null,
  papers: PaperInfo[],
): WrongbookItem[] {
  const wrongCountMap = new Map<string, number>();
  const latestWrongMap = new Map<string, { userAnswer: string; time: string }>();

  for (const at of attempts) {
    for (const a of at.answers) {
      if (a.isCorrect) continue;
      wrongCountMap.set(a.questionId, (wrongCountMap.get(a.questionId) ?? 0) + 1);
      const time = wrongEventTime(at, a);
      const current = latestWrongMap.get(a.questionId);
      // 相同時間時保留後遇到的紀錄;不同排序下若時間相同,答案通常也相同。
      if (!current || time >= current.time) {
        latestWrongMap.set(a.questionId, { userAnswer: a.userAnswer, time });
      }
    }
  }

  const items = [...latestWrongMap.entries()]
    .map(([questionId, latest]): WrongbookItem | null => {
      const q = getQuestionById(questionId);
      if (!q) return null;
      const paper = papers.find((p) => p.id === q.id.split("-")[0]);
      return {
        questionId,
        userAnswer: latest.userAnswer,
        correctAnswer: q.answer?.toLowerCase() ?? "",
        lastWrongAt: latest.time,
        wrongCount: wrongCountMap.get(questionId) ?? 1,
        paperCode: paper?.code ?? "",
        paperName: paper?.name ?? "",
        note: null,
        question: {
          id: q.id,
          number: q.number,
          ref: q.ref,
          question: q.question,
          options: q.options,
          answer: q.answer?.toLowerCase() ?? "",
          explanation: q.explanation,
          page: q.page,
          source: q.source,
          sourceLabel: q.sourceLabel,
        },
      };
    })
    .filter((it): it is WrongbookItem => it != null);

  items.sort(
    (a, b) => b.wrongCount - a.wrongCount || b.lastWrongAt.localeCompare(a.lastWrongAt),
  );
  return items;
}
