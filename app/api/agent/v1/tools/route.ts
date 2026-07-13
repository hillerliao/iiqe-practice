import { NextRequest, NextResponse } from "next/server";
import { verifyDelegationToken, type AgentScope } from "@/lib/delegation-token";
import { DomainError, finishAttempt, idempotentToolCall, readAttempt, startAttempt, submitAnswer } from "@/lib/attempt-service";
import { getPapers, getQuestionById, getQuestions } from "@/lib/data";
import { getChapterInfo } from "@/lib/chapters";
import { getPublicHandbookUrlForQuestion } from "@/lib/handbook-refs";
import { listAttempts } from "@/lib/kv";

const manifest = [
  { name: "list_papers", scope: "practice:read", description: "列出可用試卷" },
  { name: "list_questions", scope: "practice:read", description: "列出題目，不披露答案" },
  { name: "start_attempt", scope: "practice:write", description: "按指定順序建立作答" },
  { name: "get_attempt", scope: "practice:read", description: "讀取自己的作答與進度" },
  { name: "submit_answer", scope: "practice:write", description: "提交並評分一題" },
  { name: "finish_attempt", scope: "practice:write", description: "完成作答" },
  { name: "get_attempt_result", scope: "practice:read", description: "完成後讀取答案與解析" },
  { name: "get_learning_summary", scope: "learning:read", description: "取得學情摘要" },
  { name: "list_wrong_questions", scope: "learning:read", description: "列出錯題" },
  { name: "explain_question", scope: "learning:read", description: "在明確講題模式下讀取權威解析" },
] as const;

type ToolName = (typeof manifest)[number]["name"];
type Args = Record<string, unknown>;

function promptQuestion(id: string) {
  const q = getQuestionById(id);
  return q ? { id: q.id, number: q.number, ref: q.ref, question: q.question, options: q.options, page: q.page, source: q.source, sourceLabel: q.sourceLabel } : null;
}

function resultQuestion(id: string, paperCode: string) {
  const q = getQuestionById(id);
  if (!q) return null;
  return {
    ...promptQuestion(id),
    answer: q.answer.toLowerCase(),
    explanation: q.explanation,
    chapter: getChapterInfo(paperCode, q.ref),
    handbookUrl: getPublicHandbookUrlForQuestion(paperCode, q.ref),
  };
}

function auth(req: NextRequest, scope: AgentScope) {
  const header = req.headers.get("authorization");
  const payload = verifyDelegationToken(header?.startsWith("Bearer ") ? header.slice(7) : null);
  if (!payload) throw new DomainError("委託 token 無效或已過期", 401, "INVALID_DELEGATION");
  if (!payload.scopes.includes(scope)) throw new DomainError("委託 token 權限不足", 403, "INSUFFICIENT_SCOPE");
  return payload;
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), min), max);
}

function stringArg(args: Args, key: string): string {
  return typeof args[key] === "string" ? args[key] : "";
}

export async function GET() {
  return NextResponse.json({ version: "v1", tools: manifest });
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID();
  try {
    const contentLength = Number(req.headers.get("content-length") ?? 0);
    if (contentLength > 64 * 1024) throw new DomainError("請求內容過大", 413, "PAYLOAD_TOO_LARGE");
    const body = await req.json().catch(() => null) as { tool?: unknown; toolCallId?: unknown; arguments?: unknown } | null;
    if (!body || typeof body.tool !== "string") throw new DomainError("tool 必填", 400, "INVALID_INPUT");
    const tool = manifest.find((item) => item.name === body.tool);
    if (!tool) throw new DomainError("未知工具", 404, "TOOL_NOT_FOUND");
    const delegated = auth(req, tool.scope);
    const args: Args = body.arguments && typeof body.arguments === "object" && !Array.isArray(body.arguments) ? body.arguments as Args : {};

    const run = async () => {
      switch (tool.name as ToolName) {
        case "list_papers":
          return { papers: getPapers() };
        case "list_questions": {
          const paperCode = stringArg(args, "paperCode");
          const source = stringArg(args, "source") || "exam";
          const limit = boundedInteger(args.limit, 20, 1, 50);
          const offset = boundedInteger(args.offset, 0, 0, 10_000);
          const query = stringArg(args, "query").trim().toLowerCase();
          const questions = getQuestions(paperCode, source, { limit: 10_000, offset: 0, shuffle: false })
            .filter((q) => !query || q.question.toLowerCase().includes(query) || q.ref.toLowerCase().includes(query))
            .slice(offset, offset + limit)
            .map((q) => promptQuestion(q.id));
          return { questions };
        }
        case "start_attempt": {
          const ids = Array.isArray(args.questionIds) ? args.questionIds.filter((id): id is string => typeof id === "string").slice(0, 100) : [];
          const attempt = await startAttempt({
            sessionId: delegated.sid,
            paperId: stringArg(args, "paperId"),
            source: stringArg(args, "source") || "exam",
            mode: stringArg(args, "mode") || "agent",
            durationSec: typeof args.durationSec === "number" ? args.durationSec : null,
            questionIds: ids,
          });
          return { attempt, firstQuestion: promptQuestion(attempt.questionIds[0]) };
        }
        case "get_attempt": {
          const attempt = await readAttempt(delegated.sid, stringArg(args, "attemptId"));
          return { attempt, questions: attempt.questionIds.map(promptQuestion).filter(Boolean) };
        }
        case "submit_answer": {
          const answer = await submitAnswer({
            sessionId: delegated.sid,
            attemptId: stringArg(args, "attemptId"),
            questionId: stringArg(args, "questionId"),
            userAnswer: stringArg(args, "userAnswer"),
            timeSpentMs: typeof args.timeSpentMs === "number" ? args.timeSpentMs : null,
          });
          const feedbackMode = args.feedbackMode === "immediate" ? "immediate" : "deferred";
          const q = getQuestionById(answer.questionId);
          return {
            answer,
            feedback: feedbackMode === "immediate"
              ? { isCorrect: answer.isCorrect, correctAnswer: q?.answer?.toLowerCase() ?? null, explanation: q?.explanation ?? null }
              : { isCorrect: answer.isCorrect },
          };
        }
        case "finish_attempt":
          return { attempt: await finishAttempt(delegated.sid, stringArg(args, "attemptId")) };
        case "get_attempt_result": {
          const attempt = await readAttempt(delegated.sid, stringArg(args, "attemptId"));
          if (!attempt.finishedAt) throw new DomainError("Attempt 尚未完成", 409, "ATTEMPT_NOT_FINISHED");
          const paperCode = getPapers().find((p) => p.id === attempt.paperId)?.code ?? attempt.paperId;
          return {
            attempt,
            results: attempt.questionIds.map((questionId) => ({
              question: resultQuestion(questionId, paperCode),
              submitted: attempt.answers.find((answer) => answer.questionId === questionId) ?? null,
            })),
          };
        }
        case "get_learning_summary": {
          const attempts = (await listAttempts(delegated.sid)).filter((attempt) => attempt.source !== "wrongbook-redo");
          const answers = attempts.flatMap((attempt) => attempt.answers);
          const correct = answers.filter((answer) => answer.isCorrect).length;
          return { attempts: attempts.length, answered: answers.length, correct, accuracy: answers.length ? correct / answers.length : 0 };
        }
        case "list_wrong_questions": {
          const limit = boundedInteger(args.limit, 20, 1, 50);
          const attempts = await listAttempts(delegated.sid);
          const byQuestion = new Map<string, { count: number; lastWrongAt: string; userAnswer: string; paperId: string }>();
          for (const attempt of attempts) for (const answer of attempt.answers) {
            if (answer.isCorrect) continue;
            const existing = byQuestion.get(answer.questionId);
            if (!existing) byQuestion.set(answer.questionId, { count: 1, lastWrongAt: answer.createdAt, userAnswer: answer.userAnswer, paperId: attempt.paperId });
            else {
              existing.count++;
              if (answer.createdAt > existing.lastWrongAt) {
                existing.lastWrongAt = answer.createdAt;
                existing.userAnswer = answer.userAnswer;
              }
            }
          }
          const items = [...byQuestion.entries()]
            .sort((a, b) => b[1].count - a[1].count || b[1].lastWrongAt.localeCompare(a[1].lastWrongAt))
            .slice(0, limit)
            .map(([questionId, value]) => ({ question: promptQuestion(questionId), wrongCount: value.count, lastWrongAt: value.lastWrongAt, lastUserAnswer: value.userAnswer, paperId: value.paperId }));
          return { count: byQuestion.size, items };
        }
        case "explain_question": {
          if (args.mode !== "explain") throw new DomainError("必須明確指定講題模式", 400, "EXPLAIN_MODE_REQUIRED");
          const questionId = stringArg(args, "questionId");
          const q = getQuestionById(questionId);
          if (!q) throw new DomainError("Question not found", 404, "QUESTION_NOT_FOUND");
          const paperId = questionId.split("-")[0];
          const paperCode = getPapers().find((p) => p.id === paperId)?.code ?? paperId;
          return { question: resultQuestion(questionId, paperCode) };
        }
      }
    };

    const isWrite = tool.scope === "practice:write";
    const result = isWrite
      ? await idempotentToolCall({ sessionId: delegated.sid, toolCallId: typeof body.toolCallId === "string" ? body.toolCallId : "", toolName: tool.name, payload: args, execute: run })
      : await run();
    return NextResponse.json({ ok: true, requestId, data: result });
  } catch (error) {
    if (error instanceof DomainError) return NextResponse.json({ ok: false, requestId, error: { message: error.message, code: error.code } }, { status: error.status });
    console.error(`[agent/v1/tools] requestId=${requestId}`, error);
    return NextResponse.json({ ok: false, requestId, error: { message: "工具執行失敗", code: "INTERNAL_ERROR" } }, { status: 500 });
  }
}
