import { getQuestions } from "@/lib/data";
import { getPaperCode, type AttemptRecord } from "@/lib/kv";

/**
 * 新 Attempt 以 questionIds 作为精确题单。旧 Attempt 的该字段为空,
 * 只能降级为同卷别、同来源题库范围校验；不能猜测并回填原随机题单。
 */
export async function isQuestionInAttemptScope(
  attempt: AttemptRecord,
  questionId: string
): Promise<boolean> {
  if (attempt.questionIds.length > 0) {
    return attempt.questionIds.includes(questionId);
  }

  const paperCode = await getPaperCode(attempt.paperId);
  const source = attempt.source ?? "exam";
  return getQuestions(paperCode ?? attempt.paperId, source).some((question) => question.id === questionId);
}
