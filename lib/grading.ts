import "server-only";

import type { QuestionData } from "@/lib/data";

const VALID_ANSWERS = new Set(["A", "B", "C", "D"]);

export function normalizeAnswer(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const answer = value.trim().toUpperCase();
  return VALID_ANSWERS.has(answer) ? answer : null;
}

export function gradeAnswer(question: QuestionData, value: unknown): boolean {
  const submitted = normalizeAnswer(value);
  const expected = normalizeAnswer(question.answer);
  return submitted !== null && expected !== null && submitted === expected;
}
