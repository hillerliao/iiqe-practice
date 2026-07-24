export const REDO_PRACTICE_DRAFT_VERSION = 1;
export const REDO_PRACTICE_DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type RedoPracticeSource = "wrongbook" | "favorites";

export type RedoPracticeDraft = {
  version: typeof REDO_PRACTICE_DRAFT_VERSION;
  source: RedoPracticeSource;
  questionIds: string[];
  answers: Record<string, string>;
  currentQuestionId: string | null;
  finished: boolean;
  recorded: boolean;
  submissionId: string;
  shuffle: boolean;
  createdAt: number;
  updatedAt: number;
};

export function getRedoPracticeDraftKey(
  sessionId: string,
  source: RedoPracticeSource,
): string {
  return `iiqe:redo-practice:v1:${encodeURIComponent(sessionId)}:${source}`;
}

export function getWrongbookDraftKey(sessionId: string): string {
  return getRedoPracticeDraftKey(sessionId, "wrongbook");
}

export function shuffleQuestionIds(
  questionIds: readonly string[],
  random: () => number = Math.random,
): string[] {
  const shuffled = [...questionIds];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }
  return shuffled;
}

export function createRedoPracticeDraft(
  source: RedoPracticeSource,
  questionIds: readonly string[],
  shuffle: boolean,
  now = Date.now(),
): RedoPracticeDraft {
  const orderedIds = shuffle ? shuffleQuestionIds(questionIds) : [...questionIds];
  return {
    version: REDO_PRACTICE_DRAFT_VERSION,
    source,
    questionIds: orderedIds,
    answers: {},
    currentQuestionId: orderedIds[0] ?? null,
    finished: false,
    recorded: false,
    submissionId: createRedoSubmissionId(now),
    shuffle,
    createdAt: now,
    updatedAt: now,
  };
}

export function createWrongbookDraft(
  questionIds: readonly string[],
  shuffle: boolean,
  now = Date.now(),
): RedoPracticeDraft {
  return createRedoPracticeDraft("wrongbook", questionIds, shuffle, now);
}

export function parseRedoPracticeDraft(
  raw: string | null,
  source: RedoPracticeSource,
  now = Date.now(),
): RedoPracticeDraft | null {
  if (!raw) return null;

  try {
    const value: unknown = JSON.parse(raw);
    if (!isRedoPracticeDraft(value) || value.source !== source) return null;
    if (now - value.updatedAt > REDO_PRACTICE_DRAFT_TTL_MS) return null;
    return value;
  } catch {
    return null;
  }
}

export function parseWrongbookDraft(
  raw: string | null,
  now = Date.now(),
): RedoPracticeDraft | null {
  return parseRedoPracticeDraft(raw, "wrongbook", now);
}

export function reconcileRedoPracticeDraft(
  draft: RedoPracticeDraft | null,
  availableQuestionIds: readonly string[],
): RedoPracticeDraft | null {
  if (!draft) return null;
  const available = new Set(availableQuestionIds);
  const questionIds = draft.questionIds.filter((id) => available.has(id));
  if (questionIds.length === 0) return null;

  const allowed = new Set(questionIds);
  const answers = Object.fromEntries(
    Object.entries(draft.answers).filter(([id]) => allowed.has(id)),
  );
  const currentQuestionId =
    draft.currentQuestionId && allowed.has(draft.currentQuestionId)
      ? draft.currentQuestionId
      : questionIds.find((id) => answers[id] == null) ?? questionIds[questionIds.length - 1];

  return { ...draft, questionIds, answers, currentQuestionId };
}

export function reconcileWrongbookDraft(
  draft: RedoPracticeDraft | null,
  availableQuestionIds: readonly string[],
): RedoPracticeDraft | null {
  if (draft?.source !== "wrongbook") return null;
  return reconcileRedoPracticeDraft(draft, availableQuestionIds);
}

export function createRedoSubmissionId(now = Date.now()): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `redo_${now.toString(36)}_${random}`;
}

function isRedoPracticeDraft(value: unknown): value is RedoPracticeDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<RedoPracticeDraft>;
  return (
    draft.version === REDO_PRACTICE_DRAFT_VERSION &&
    (draft.source === "wrongbook" || draft.source === "favorites") &&
    Array.isArray(draft.questionIds) &&
    draft.questionIds.length > 0 &&
    draft.questionIds.every((id) => typeof id === "string" && id.length > 0) &&
    !!draft.answers &&
    typeof draft.answers === "object" &&
    !Array.isArray(draft.answers) &&
    Object.entries(draft.answers).every(
      ([id, answer]) => id.length > 0 && typeof answer === "string",
    ) &&
    (draft.currentQuestionId === null || typeof draft.currentQuestionId === "string") &&
    typeof draft.finished === "boolean" &&
    typeof draft.recorded === "boolean" &&
    typeof draft.submissionId === "string" &&
    draft.submissionId.length > 0 &&
    typeof draft.shuffle === "boolean" &&
    typeof draft.createdAt === "number" &&
    Number.isFinite(draft.createdAt) &&
    typeof draft.updatedAt === "number" &&
    Number.isFinite(draft.updatedAt)
  );
}
