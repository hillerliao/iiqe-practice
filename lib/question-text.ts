const HAN = "\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff";
const HAN_SPACE = new RegExp(`([${HAN}])[ \\u00a0\\u3000]+(?=[${HAN}])`, "gu");

export function normalizeQuestionText(text: string): string {
  return text.replace(HAN_SPACE, "$1");
}

export function hasHanInternalSpace(text: string): boolean {
  HAN_SPACE.lastIndex = 0;
  return HAN_SPACE.test(text);
}

export function normalizeQuestionFields<T extends {
  question: string;
  options: Record<string, string>;
  explanation?: string | null;
}>(question: T): T {
  return {
    ...question,
    question: normalizeQuestionText(question.question),
    options: Object.fromEntries(
      Object.entries(question.options).map(([key, value]) => [key, normalizeQuestionText(value)]),
    ),
    explanation:
      question.explanation == null
        ? question.explanation
        : normalizeQuestionText(question.explanation),
  };
}
