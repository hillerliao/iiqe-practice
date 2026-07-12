import {
  buildQuestionTextLines,
  type QuestionTextOptions,
} from "@/components/CopyQuestionButton";

/**
 * 搜尋內容與複製題目相同,僅將換行改成空白以適應搜尋框。
 */
export function buildSearchQuery(opts: QuestionTextOptions): string {
  return buildQuestionTextLines(opts).join(" ");
}
