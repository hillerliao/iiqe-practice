import assert from "node:assert/strict";
import {
  REDO_PRACTICE_DRAFT_TTL_MS,
  createRedoPracticeDraft,
  createWrongbookDraft,
  getRedoPracticeDraftKey,
  parseRedoPracticeDraft,
  parseWrongbookDraft,
  reconcileRedoPracticeDraft,
  reconcileWrongbookDraft,
  shuffleQuestionIds,
} from "../lib/redo-practice-draft";

const now = 1_800_000_000_000;
const ids = ["q1", "q2", "q3", "q4"];
const randomValues = [0.25, 0.75, 0.1, 0.5];
let randomIndex = 0;
const shuffled = shuffleQuestionIds(ids, () => randomValues[randomIndex++]);
assert.deepEqual(shuffled, ["q4", "q1", "q3", "q2"]);
assert.deepEqual(ids, ["q1", "q2", "q3", "q4"], "shuffle must not mutate input");

const draft = createWrongbookDraft(ids, false, now);
assert.equal(typeof draft.submissionId, "string");
assert.ok(draft.submissionId.startsWith("redo_"));
draft.answers = { q1: "a", q2: "b", removed: "c" };
draft.currentQuestionId = "removed";
draft.recorded = true;

const restored = parseWrongbookDraft(JSON.stringify(draft), now + 1_000);
assert.deepEqual(restored, draft, "valid state should survive serialization");
assert.equal(parseWrongbookDraft("not json", now), null);
assert.equal(parseWrongbookDraft(JSON.stringify({ ...draft, version: 2 }), now), null);
assert.equal(
  parseWrongbookDraft(JSON.stringify(draft), now + REDO_PRACTICE_DRAFT_TTL_MS + 1),
  null,
  "expired state should be rejected",
);

const reconciled = reconcileWrongbookDraft(draft, ["q1", "q2", "q3", "new"]);
assert.ok(reconciled);
assert.deepEqual(reconciled.questionIds, ["q1", "q2", "q3"]);
assert.deepEqual(reconciled.answers, { q1: "a", q2: "b" });
assert.equal(reconciled.currentQuestionId, "q3", "resume at first unanswered question");
assert.equal(reconciled.recorded, true, "submission marker must survive refresh");
assert.equal(reconciled.questionIds.includes("new"), false, "new questions must not join active run");
assert.equal(reconcileWrongbookDraft(draft, ["new"]), null);

const restarted = {
  ...reconciled,
  answers: {},
  currentQuestionId: reconciled.questionIds[0],
  finished: false,
  recorded: false,
};
assert.deepEqual(restarted.questionIds, reconciled.questionIds, "restart must preserve order");

const favoritesKey = getRedoPracticeDraftKey("user@example.com", "favorites");
const wrongbookKey = getRedoPracticeDraftKey("user@example.com", "wrongbook");
const otherSessionWrongbookKey = getRedoPracticeDraftKey("other@example.com", "wrongbook");
const encodedSessionKey = getRedoPracticeDraftKey("user/name + test@example.com", "wrongbook");
assert.notEqual(favoritesKey, wrongbookKey, "practice sources must use independent keys");
assert.notEqual(
  wrongbookKey,
  otherSessionWrongbookKey,
  "different sessions must use independent keys for the same source",
);
assert.equal(
  encodedSessionKey,
  "iiqe:redo-practice:v1:user%2Fname%20%2B%20test%40example.com:wrongbook",
  "custom session IDs must be URL encoded in storage keys",
);

const favoritesDraft = createRedoPracticeDraft("favorites", ids, false, now);
favoritesDraft.answers = { q1: "d", removed: "a" };
favoritesDraft.currentQuestionId = "removed";
const restoredFavorites = parseRedoPracticeDraft(
  JSON.stringify(favoritesDraft),
  "favorites",
  now + 1_000,
);
assert.deepEqual(restoredFavorites, favoritesDraft);
assert.equal(
  parseRedoPracticeDraft(JSON.stringify(favoritesDraft), "wrongbook", now + 1_000),
  null,
  "a draft from another source must not be restored",
);

const reconciledFavorites = reconcileRedoPracticeDraft(favoritesDraft, ["q1", "q2", "new"]);
assert.ok(reconciledFavorites);
assert.deepEqual(reconciledFavorites.questionIds, ["q1", "q2"]);
assert.deepEqual(reconciledFavorites.answers, { q1: "d" });
assert.equal(reconciledFavorites.currentQuestionId, "q2");
assert.equal(reconciledFavorites.questionIds.includes("new"), false);

const originalRandom = Math.random;
try {
  randomIndex = 0;
  Math.random = () => randomValues[randomIndex++];
  const shuffledDraft = createRedoPracticeDraft("wrongbook", ids, true, now);
  const restoredShuffled = parseRedoPracticeDraft(
    JSON.stringify(shuffledDraft),
    "wrongbook",
    now + 1_000,
  );
  assert.ok(restoredShuffled);
  const reconciledShuffled = reconcileRedoPracticeDraft(
    restoredShuffled,
    ["q3", "q2", "q4", "q1"],
  );
  assert.ok(reconciledShuffled);
  assert.equal(reconciledShuffled.shuffle, true, "shuffle marker must survive restoration");
  assert.deepEqual(
    reconciledShuffled.questionIds,
    shuffledDraft.questionIds,
    "restoration must preserve the fixed shuffled order instead of API order",
  );
} finally {
  Math.random = originalRandom;
}

console.log("[redo-practice-draft] OK: draft lifecycle and fixed ordering verified");
