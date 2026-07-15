import assert from "node:assert/strict";

import p1ExamRaw from "../data/questions-p1-exam.json" with { type: "json" };
import p1MockRaw from "../data/questions-p1-mock.json" with { type: "json" };
import p3ExamRaw from "../data/questions-p3-exam.json" with { type: "json" };
import p3MockRaw from "../data/questions-p3-mock.json" with { type: "json" };
import { buildQuestionTextLines } from "../components/CopyQuestionButton.tsx";
import { getPapers, getQuestions } from "../lib/data.ts";

type Question = {
  id: string;
  number: number;
  question: string;
  options: Record<string, string>;
  answer: string | null;
};

const questionSets = [p1ExamRaw, p1MockRaw, p3ExamRaw, p3MockRaw] as Question[][];
const questions = questionSets.flat();
const optionKeys = ["a", "b", "c", "d"];
const romanStatement = /^\s*(?:iv|iii|ii|i)\s*[.．）)]\s*[\p{Script=Han}]/iu;
const firstThreeStatements = [
  /(?:^|\n)\s*i\s*[.．）)]/i,
  /(?:^|\n)\s*ii\s*[.．）)]/i,
  /(?:^|\n)\s*iii\s*[.．）)]/i,
];
const fourthStatement = /(?:^|\n)\s*iv\s*[.．）)]/i;

for (const question of questions) {
  const keys = Object.keys(question.options).sort();
  if (keys.length === 0) continue;

  assert.deepEqual(
    keys,
    optionKeys,
    `${question.id}: options must contain exactly a, b, c, and d`,
  );

  for (const key of optionKeys) {
    assert.equal(
      typeof question.options[key] === "string" && question.options[key].trim().length > 0,
      true,
      `${question.id}: option ${key} must be non-empty`,
    );
  }

  if (question.answer) {
    assert.equal(optionKeys.includes(question.answer.toLowerCase()), true, `${question.id}: invalid answer`);
  }

  const looksLikeFourStatementQuestion = firstThreeStatements.every((pattern) => pattern.test(question.question));
  const optionContainsRomanStatement = Object.values(question.options).some((option) => romanStatement.test(option));
  assert.equal(
    looksLikeFourStatementQuestion && !fourthStatement.test(question.question) && optionContainsRomanStatement,
    false,
    `${question.id}: a roman-labeled stem statement appears to have been misplaced into an option`,
  );
}

const p3Question62 = (p3ExamRaw as Question[]).find((question) => question.id === "P3-exam-62");
assert.ok(p3Question62, "P3-exam-62 must exist");
assert.equal(firstThreeStatements.every((pattern) => pattern.test(p3Question62.question)), true);
assert.equal(fourthStatement.test(p3Question62.question), true, "P3-exam-62 must retain statement iv in the stem");
assert.equal(p3Question62.options.b.replace(/\s/g, ""), "i,ii,iv");
assert.equal(p3Question62.answer?.toLowerCase(), "b");
const copiedQuestion62 = buildQuestionTextLines({ ...p3Question62, paper: "P3" }).join("\n");
assert.match(copiedQuestion62, /(?:^|\n)iv\.[^\n]+/i);
assert.match(copiedQuestion62, /(?:^|\n)B\. i,ii,iv(?:\n|$)/);

const repairedQuestionIds = [
  "P3-exam-11",
  "P3-exam-15",
  "P3-exam-51",
  "P3-exam-62",
  "P3-exam-298",
  "P1-exam-309",
  "P1-exam-329",
  "P1-exam-368",
  "P1-mock-662",
  "P1-mock-704",
  "P1-mock-705",
  "P1-mock-706",
  "P1-mock-838",
];
const questionsById = new Map(questions.map((question) => [question.id, question]));
for (const id of repairedQuestionIds) {
  const question = questionsById.get(id);
  assert.ok(question, `${id}: repaired question must exist`);
  assert.equal(
    Object.values(question.options).some((option) => romanStatement.test(option)),
    false,
    `${id}: repaired option must not contain a full roman-labeled stem statement`,
  );
}

const p3MockQuestion106 = (p3MockRaw as Question[]).find((question) => question.id === "P3-mock-106");
assert.ok(p3MockQuestion106, "P3-mock-106 must exist");
assert.deepEqual(Object.keys(p3MockQuestion106.options).sort(), optionKeys);
for (const key of optionKeys) {
  assert.equal(p3MockQuestion106.options[key].trim().length > 0, true, `P3-mock-106: option ${key} must be non-empty`);
}
assert.equal(p3MockQuestion106.answer?.toLowerCase(), "b");

const ungradeableQuestionIds = new Set(
  questions
    .filter((question) =>
      !question.answer ||
      !optionKeys.includes(question.answer.toLowerCase() as (typeof optionKeys)[number]) ||
      !optionKeys.every((key) => typeof question.options[key] === "string" && question.options[key].trim().length > 0),
    )
    .map((question) => question.id),
);
for (const [paperCode, source] of [["P1", "exam"], ["P1", "mock"], ["P3", "exam"], ["P3", "mock"]] as const) {
  const selectedQuestions = getQuestions(paperCode, source);
  assert.equal(
    selectedQuestions.some((question) => ungradeableQuestionIds.has(question.id)),
    false,
    `${paperCode}-${source}: normal practice selection must exclude ungradeable questions`,
  );

  const paper = getPapers().find((item) => item.code === paperCode);
  assert.ok(paper, `${paperCode}: paper must exist`);
  assert.equal(paper.bySource[source], selectedQuestions.length, `${paperCode}-${source}: displayed count must match selectable questions`);
}
assert.equal(getQuestions("P3", "mock").some((question) => question.id === "P3-mock-106"), true);

console.log(`Question data integrity tests passed (${questions.length} questions).`);
