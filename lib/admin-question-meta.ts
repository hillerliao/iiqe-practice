// 管理员编辑题目所需的元信息映射:
// - 由 papers.json + 已知的文件命名约定推导,避免在路由层硬编码字符串解析。
// - 当前文件命名: data/questions-{paperCodeLower}-{source}.json
//   例如 P1+exam → data/questions-p1-exam.json;P3+mock → data/questions-p3-mock.json。
//
// 如未来增加 paperCode 或 source,只需扩展 VALID_PAPER_CODES / VALID_SOURCES 集合。

import papersData from "@/data/papers.json";
import type { PaperInfo } from "@/lib/data";
import type { QuestionData } from "@/lib/data";

export type QuestionSource = "exam" | "mock";

export type FileMapping = {
  /** 仓库相对路径,例如 "data/questions-p1-exam.json" */
  file: string;
  paperCode: string;
  source: QuestionSource;
};

/**
 * 由题目的 id + source 推导出对应的 JSON 数据文件路径。
 * @throws 如果 id 格式不合法或 paperCode 不在 papers.json 中
 */
export function resolveMapping(q: Pick<QuestionData, "id" | "source">): FileMapping {
  const paperCode = q.id.split("-")[0];
  if (!paperCode) {
    throw new Error(`題目 id 格式不合法: ${q.id}`);
  }
  const papers = papersData as PaperInfo[];
  const paper = papers.find((p) => p.code === paperCode);
  if (!paper) {
    throw new Error(`未知的 paperCode: ${paperCode}(id=${q.id})`);
  }
  if (q.source !== "exam" && q.source !== "mock") {
    throw new Error(`題目 source 不合法: ${q.source}(id=${q.id})`);
  }
  return {
    file: `data/questions-${paperCode.toLowerCase()}-${q.source}.json`,
    paperCode,
    source: q.source,
  };
}

/**
 * 由 paperCode + source 推导 JSON 数据文件路径(新增题目时使用)。
 */
export function resolveFile(paperCode: string, source: QuestionSource): string {
  return `data/questions-${paperCode.toLowerCase()}-${source}.json`;
}