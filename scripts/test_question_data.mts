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
const mockSets = [
  { code: "P1", questions: p1MockRaw as Question[], expectedCount: 919 },
  { code: "P3", questions: p3MockRaw as Question[], expectedCount: 865 },
] as const;
const romanStatement = /^\s*(?:iv|iii|ii|i)\s*[.．）)]\s*[\p{Script=Han}]/iu;
const firstThreeStatements = [
  /(?:^|\n)\s*i\s*[.．）)]/i,
  /(?:^|\n)\s*ii\s*[.．）)]/i,
  /(?:^|\n)\s*iii\s*[.．）)]/i,
];
const fourthStatement = /(?:^|\n)\s*iv\s*[.．）)]/i;

for (const { code, questions: mockQuestions, expectedCount } of mockSets) {
  assert.equal(mockQuestions.length, expectedCount, `${code}-mock: exact question count`);
  assert.deepEqual(
    mockQuestions.map((question) => question.number),
    Array.from({ length: expectedCount }, (_, index) => index + 1),
    `${code}-mock: question numbers must be sequential`,
  );
  assert.deepEqual(
    mockQuestions.map((question) => question.id),
    Array.from({ length: expectedCount }, (_, index) => `${code}-mock-${index + 1}`),
    `${code}-mock: stable IDs must match question numbers`,
  );
}

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

const p1MockQuestion193 = (p1MockRaw as Question[]).find((question) => question.id === "P1-mock-193");
assert.ok(p1MockQuestion193, "P1-mock-193 must exist");
assert.equal(
  p1MockQuestion193.options.d,
  "口頭以外的方式授權",
  "P1-mock-193 option d must not contain the next question stem",
);

const p1MockQuestion194 = (p1MockRaw as Question[]).find((question) => question.id === "P1-mock-194");
assert.ok(p1MockQuestion194, "P1-mock-194 must exist");
assert.equal(
  p1MockQuestion194.question,
  "就表面權限而言，權限問題與代理關係是有所相關及分別，以下哪些或哪項是正確的?",
  "P1-mock-194 must retain its complete question stem",
);

const p1MockQuestion578 = (p1MockRaw as Question[]).find((question) => question.id === "P1-mock-578");
assert.ok(p1MockQuestion578, "P1-mock-578 must exist");
assert.equal(
  p1MockQuestion578.options.d,
  "保險通過一個或以上的保險合約，把他已經受保的風險的部分或全部轉移至另一保險人",
  "P1-mock-578 must retain its wrapped option d continuation",
);

for (const number of [659, 712]) {
  const question = (p1MockRaw as Question[]).find((item) => item.number === number);
  assert.ok(question, `P1-mock-${number} must exist`);
  assert.equal(
    question.options.d,
    "年金購買人投訴該保險人，根據錯誤計算支付較低的退保價值，導致損失了有關的保單利息",
    `P1-mock-${number} must retain its wrapped option d continuation`,
  );
}

const p1MockQuestion738 = (p1MockRaw as Question[]).find((question) => question.id === "P1-mock-738");
assert.ok(p1MockQuestion738, "P1-mock-738 must exist");
assert.equal(p1MockQuestion738.options.d, "其他事宜", "P1-mock-738 option d must not contain the next question stem");

const p1MockQuestion739 = (p1MockRaw as Question[]).find((question) => question.id === "P1-mock-739");
assert.ok(p1MockQuestion739, "P1-mock-739 must exist");
assert.equal(
  p1MockQuestion739.question,
  "個人持牌人曾在香港或其他地方被法院撤銷擔任公司董事的資格，涉及以下哪領域？",
  "P1-mock-739 must retain its complete question stem",
);
assert.equal(p1MockQuestion739.options.d, "其他事宜");

const p1MockQuestion740 = (p1MockRaw as Question[]).find((question) => question.id === "P1-mock-740");
assert.ok(p1MockQuestion740, "P1-mock-740 must exist");
assert.equal(p1MockQuestion740.question.startsWith("根據規則3"), true, "P1-mock-740 must start at its own question boundary");
assert.equal(p1MockQuestion740.options.d, "以上各項皆不是", "P1-mock-740 option d must not contain the next question stem");

const p1MockQuestion741 = (p1MockRaw as Question[]).find((question) => question.id === "P1-mock-741");
assert.ok(p1MockQuestion741, "P1-mock-741 must exist");
assert.equal(
  p1MockQuestion741.question,
  "一個保險代理人希望代表一個綜合保險人的一般及長期業務，根據《保險業條例》中的規則是：",
  "P1-mock-741 must retain its complete question stem",
);

const p1MockQuestion799 = (p1MockRaw as Question[]).find((question) => question.id === "P1-mock-799");
assert.ok(p1MockQuestion799, "P1-mock-799 must exist");
assert.equal(
  p1MockQuestion799.options.d,
  "爭議雙方使用保險投訴局的調解服務前，須已通過仲裁程序並未能從中成功解決紛爭",
  "P1-mock-799 must retain its wrapped option d continuation",
);

const p1MockQuestion800 = (p1MockRaw as Question[]).find((question) => question.id === "P1-mock-800");
assert.ok(p1MockQuestion800, "P1-mock-800 must exist");
assert.equal(p1MockQuestion800.question, "以下哪項關於保險代理人的陳述是不正確的:");
assert.equal(p1MockQuestion800.question.startsWith("解決紛爭"), false);

const p3MockQuestion91 = (p3MockRaw as Question[]).find((question) => question.id === "P3-mock-91");
assert.ok(p3MockQuestion91, "P3-mock-91 must exist");
assert.equal(p3MockQuestion91.options.d, "維護保險公司利益");

const p3MockQuestion92 = (p3MockRaw as Question[]).find((question) => question.id === "P3-mock-92");
assert.ok(p3MockQuestion92, "P3-mock-92 must exist");
assert.equal(
  p3MockQuestion92.question,
  "在人壽保險保費的一般計算中，在正常統計預期下足夠支付死亡索償所需向保單所有人收取的金額是以下哪一種保費：",
);

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
