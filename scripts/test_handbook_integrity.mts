import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { getChapterInfo } from "../lib/chapters.ts";

type Chapter = {
  id: string;
  level: number;
  number: string;
  title: string;
  page: number;
  parent?: string;
};

type Handbook = {
  slug: string;
  title: string;
  version: string;
  chapters: Chapter[];
  html: string;
};

const handbookPath = path.join(process.cwd(), "public", "handbook", "exam3-2022.json");
const handbook = JSON.parse(await fs.readFile(handbookPath, "utf8")) as Handbook;
const coreH1 = handbook.chapters.filter((chapter) => chapter.level === 1 && /^ch-[1-5]$/.test(chapter.id));
const coreH2 = handbook.chapters.filter((chapter) => chapter.level === 2 && /^ch-[1-5]-\d+$/.test(chapter.id));

assert.equal(coreH1.length, 5, "P3 handbook should contain 5 core H1 chapters");
assert.equal(coreH2.length, 31, "P3 handbook should contain 31 core H2 chapters");

const h1ById = new Map(coreH1.map((chapter) => [chapter.id, chapter]));
for (const chapter of coreH2) {
  const info = getChapterInfo("P3", chapter.number);
  assert.ok(info, `chapter table is missing ${chapter.number}`);
  assert.equal(info.main, h1ById.get(chapter.parent ?? "")?.title, `${chapter.number} main title mismatch`);
  const chineseTitle = chapter.title.replace(/\s*\([^)]*[A-Za-z][^)]*\)\s*$/, "");
  assert.equal(info.sub, chineseTitle, `${chapter.number} subchapter title mismatch`);
  assert.equal(chapter.id, `ch-${chapter.number.replaceAll(".", "-")}`);
}

const chapterIds = handbook.chapters.map((chapter) => chapter.id);
assert.equal(new Set(chapterIds).size, chapterIds.length, "chapter directory IDs must be unique");
for (const id of chapterIds) {
  const matches = handbook.html.match(new RegExp(`id=["']${id}["']`, "g")) ?? [];
  assert.equal(matches.length, 1, `chapter anchor ${id} should appear exactly once in body HTML`);
}

const headingPattern = /<h([1-3])\s+id=["']([^"']+)["']/g;
const bodyHeadings = Array.from(handbook.html.matchAll(headingPattern), (match) => ({
  level: Number(match[1]),
  id: match[2],
}));
assert.deepEqual(
  bodyHeadings,
  handbook.chapters.map((chapter) => ({ level: chapter.level, id: chapter.id })),
  "directory and body heading order should match",
);

const pdfPageIds = Array.from(handbook.html.matchAll(/id=["'](pdf-page-\d+)["']/g), (match) => match[1]);
assert.equal(new Set(pdfPageIds).size, pdfPageIds.length, "canonical PDF page IDs must be unique");

const attachments = handbook.chapters.filter((chapter) => /^att-[A-N]$/.test(chapter.id));
assert.equal(attachments.length, 14, "P3 handbook should contain attachments A-N");
for (const attachment of attachments) {
  assert.notEqual(
    attachment.title,
    attachment.number,
    `${attachment.number} should use its descriptive title in the directory`,
  );
}

console.log("handbook integrity tests passed");
