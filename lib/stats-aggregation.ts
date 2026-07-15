import { getChapterKey } from "./chapters";

export type ChapterStatAnswer = {
  paperCode: string;
  ref: string | null | undefined;
  isCorrect: boolean;
};

export type ChapterStat = {
  ref: string;
  paperCode: string;
  total: number;
  correct: number;
  accuracy: number;
};

export function aggregateChapterStats(answers: ChapterStatAnswer[]): ChapterStat[] {
  const groups: Record<string, { paperCode: string; total: number; correct: number }> = {};

  for (const answer of answers) {
    const rawRef = answer.ref?.trim() || "其他";
    const ref = getChapterKey(rawRef) ?? rawRef;
    const key = `${answer.paperCode}::${ref}`;
    if (!groups[key]) groups[key] = { paperCode: answer.paperCode, total: 0, correct: 0 };
    groups[key].total++;
    if (answer.isCorrect) groups[key].correct++;
  }

  return Object.entries(groups)
    .map(([key, value]) => ({
      ref: key.split("::")[1],
      paperCode: value.paperCode,
      total: value.total,
      correct: value.correct,
      accuracy: value.total > 0 ? value.correct / value.total : 0,
    }))
    .sort((a, b) => {
      if (a.paperCode !== b.paperCode) return a.paperCode.localeCompare(b.paperCode);
      const aKey = getChapterKey(a.ref);
      const bKey = getChapterKey(b.ref);
      if (aKey && bKey) {
        const [aMain, aSub] = aKey.split(".").map(Number);
        const [bMain, bSub] = bKey.split(".").map(Number);
        return aMain - bMain || aSub - bSub;
      }
      if (aKey) return -1;
      if (bKey) return 1;
      return a.ref.localeCompare(b.ref, "zh-Hant", { numeric: true });
    });
}
