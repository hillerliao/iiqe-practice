import assert from "node:assert/strict";
import { aggregateChapterStats } from "../lib/stats-aggregation.ts";

const stats = aggregateChapterStats([
  { paperCode: "P3", ref: "2.4", isCorrect: true },
  { paperCode: "P3", ref: "2.4(e)", isCorrect: true },
  { paperCode: "P3", ref: "2.4(f)", isCorrect: false },
  { paperCode: "P3", ref: "5.1", isCorrect: true },
  { paperCode: "P3", ref: "5.1(a)", isCorrect: false },
  { paperCode: "P3", ref: "5.1(g)", isCorrect: true },
  { paperCode: "P3", ref: "2(b)", isCorrect: false },
  { paperCode: "P3", ref: "", isCorrect: true },
]);

assert.deepEqual(stats, [
  { ref: "2.4", paperCode: "P3", total: 3, correct: 2, accuracy: 2 / 3 },
  { ref: "5.1", paperCode: "P3", total: 3, correct: 2, accuracy: 2 / 3 },
  { ref: "2(b)", paperCode: "P3", total: 1, correct: 0, accuracy: 0 },
  { ref: "其他", paperCode: "P3", total: 1, correct: 1, accuracy: 1 },
]);

console.log("statistics chapter aggregation tests passed");
