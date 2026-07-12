import * as fs from "node:fs";
import * as path from "node:path";
import {
  hasHanInternalSpace,
  normalizeQuestionFields,
  normalizeQuestionText,
} from "../lib/question-text";

type Question = {
  id: string;
  question: string;
  options: Record<string, string>;
  explanation: string | null;
};

const dataDir = path.resolve(__dirname, "..", "data");
const files = fs
  .readdirSync(dataDir)
  .filter((file) => /^questions-.*\.json$/.test(file))
  .sort();
const failures: string[] = [];
const chain = "最 短 年 金 期";

if (normalizeQuestionText(chain) !== "最短年金期") {
  failures.push("normalizer does not collapse a consecutive Han-space chain");
}
if (normalizeQuestionText(normalizeQuestionText(chain)) !== normalizeQuestionText(chain)) {
  failures.push("normalizer is not idempotent");
}

let q62: Question | undefined;
for (const file of files) {
  const questions = JSON.parse(fs.readFileSync(path.join(dataDir, file), "utf8")) as Question[];
  for (const question of questions) {
    const fields: [string, string][] = [
      ["question", question.question],
      ["explanation", question.explanation ?? ""],
      ...Object.entries(question.options).map(([key, value]): [string, string] => [
        `options.${key}`,
        value,
      ]),
    ];
    for (const [field, value] of fields) {
      if (hasHanInternalSpace(value)) failures.push(`${file}:${question.id}:${field}`);
    }
    if (JSON.stringify(normalizeQuestionFields(question)) !== JSON.stringify(question)) {
      failures.push(`${file}:${question.id}:normalization mismatch`);
    }
    if (question.id === "P3-exam-62") q62 = question;
  }
}

if (!q62) {
  failures.push("P3-exam-62 is missing");
} else {
  if (!q62.question.includes("最短年金期不得少於 10年")) {
    failures.push("P3-exam-62 annual period text is not normalized");
  }
  if (!q62.question.includes("年金期最早由年金領取人年滿 50歲開始")) {
    failures.push("P3-exam-62 start age text is not normalized");
  }
  if (q62.options.b !== "i,ii,iv") {
    failures.push(`P3-exam-62 options.b changed: ${q62.options.b}`);
  }
}

if (failures.length > 0) {
  console.error(
    `[question-text] ${failures.length} failure(s):\n${failures.map((item) => `  - ${item}`).join("\n")}`,
  );
  process.exit(1);
}

console.log(`[question-text] OK: ${files.length} question files contain no Han-internal spaces`);
