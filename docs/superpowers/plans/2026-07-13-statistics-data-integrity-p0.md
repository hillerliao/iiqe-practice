# Statistics Data Integrity P0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make existing statistics trustworthy without adding advanced analytics fields or guessing missing question content.

**Architecture:** Preserve Answer rows as immutable historical facts, derive statistics from actual submitted answers, and normalize legacy paper identifiers at the statistics boundary. Keep the existing JSON-backed question source and storage abstraction intact. Quarantine ungradeable questions through validation/reporting until an authoritative source supplies their missing answer or options.

**Tech Stack:** Next.js App Router, TypeScript, Prisma with SQLite, JSON question data, existing script-based test harness.

---

## Scope and file map

- Modify `app/api/stats/route.ts`: exclude zero-answer attempts, expose explicit answered accuracy semantics, and normalize legacy paper IDs.
- Modify `app/api/wrongbook/route.ts`: calculate the true latest wrong timestamp and stop deleting historical Answer rows.
- Modify `lib/kv.ts`: add a non-destructive wrongbook dismissal state to the storage abstraction.
- Modify `lib/kv-sqlite.ts`: persist and read the wrongbook dismissal state in SQLite without changing Answer history.
- Modify `prisma/schema.prisma`: add an additive, nullable/defaulted model for dismissed wrongbook items.
- Create `lib/stats.ts`: pure helpers for attempt filtering, accuracy calculation, paper-code resolution, and latest-wrong aggregation.
- Create `scripts/test_stats_integrity.mts`: regression tests for the pure statistics rules.
- Modify `scripts/test_question_data.mts`: fail on ungradeable question records and report exact IDs.
- Do not modify `app/stats/page.tsx` except in a later, separately approved UI task; preserve the user's current removal of `RecentAttemptsCard`.
- Do not fill answers/options for `P1-exam-117`, `P1-mock-594`, `P3-mock-106`, `P3-mock-173`, `P3-mock-193`, or `P3-mock-194` without an authoritative external source.

### Task 1: Add pure statistics integrity helpers

**Files:**
- Create: `lib/stats.ts`
- Create: `scripts/test_stats_integrity.mts`
- Modify: `package.json`

- [ ] **Step 1: Write failing helper tests**

Create test cases that assert:

```ts
assert.equal(hasSubmittedAnswers({ answers: [] }), false);
assert.equal(hasSubmittedAnswers({ answers: [{ isCorrect: true }] }), true);
assert.deepEqual(calculateAccuracy([{ isCorrect: true }, { isCorrect: false }]), {
  answered: 2,
  correct: 1,
  accuracy: 0.5,
});
assert.equal(resolvePaperCode("P1", []), "P1");
assert.equal(
  resolvePaperCode("legacy-paper-id", [{ questionId: "P3-exam-1" }]),
  "P3",
);
assert.equal(
  latestWrongAt([
    { createdAt: "2026-01-01T00:00:00.000Z" },
    { createdAt: "2026-02-01T00:00:00.000Z" },
  ]),
  "2026-02-01T00:00:00.000Z",
);
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npx tsx scripts/test_stats_integrity.mts
```

Expected: failure because `lib/stats.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure helpers**

Implement exported helpers with these contracts:

```ts
export function hasSubmittedAnswers(attempt: { answers: unknown[] }): boolean;

export function calculateAccuracy(
  answers: Array<{ isCorrect: boolean }>,
): { answered: number; correct: number; accuracy: number };

export function resolvePaperCode(
  paperId: string,
  answers: Array<{ questionId: string }>,
): string;

export function latestWrongAt(
  answers: Array<{ createdAt: string }>,
): string | null;
```

`resolvePaperCode` must accept current `P<number>` codes directly and otherwise derive the code from a question ID matching `^(P\d+)-`. If neither is available, return the original ID instead of inventing a mapping.

- [ ] **Step 4: Add a package script and run the test**

Add:

```json
"test:stats-integrity": "tsx scripts/test_stats_integrity.mts"
```

Run:

```bash
npm run test:stats-integrity
```

Expected: all assertions pass.

- [ ] **Step 5: Commit the isolated helper change**

```bash
git add lib/stats.ts scripts/test_stats_integrity.mts package.json
git commit -m "test(stats): define data integrity rules"
```

Only commit when explicitly requested by the user.

### Task 2: Correct statistics aggregation semantics

**Files:**
- Modify: `app/api/stats/route.ts`
- Modify: `scripts/test_stats_integrity.mts`

- [ ] **Step 1: Extend tests for zero-answer and legacy-paper aggregation**

Add fixtures proving that:

- an attempt with `totalQ: 20` and no Answer rows contributes zero answered questions and is absent from effective practice counts;
- an unfinished attempt with two Answer rows contributes exactly two answered questions;
- a legacy Attempt paper ID containing a `P3-*` answer aggregates under `P3`;
- `wrongbook-redo` remains excluded from general statistics.

- [ ] **Step 2: Run tests and verify the new aggregation assertions fail**

Run:

```bash
npm run test:stats-integrity
```

Expected: failure until the route aggregation uses the new rules.

- [ ] **Step 3: Update `/api/stats` aggregation**

Apply these rules in `app/api/stats/route.ts`:

```ts
const attempts = (await listAttempts(sessionId))
  .filter((attempt) => attempt.source !== "wrongbook-redo")
  .filter(hasSubmittedAnswers);
```

For every total and accuracy:

```ts
const { answered, correct, accuracy } = calculateAccuracy(answers);
```

Keep `total` as the existing response field for compatibility, but document and calculate it as actual submitted Answer count. Do not use `Attempt.totalQ` for overall accuracy.

Build paper groups with `resolvePaperCode(attempt.paperId, attempt.answers)`. Resolve the display name from `getPapers()` by either paper ID or paper code. If no paper metadata exists, display the resolved code rather than an empty string.

Do not alter the current stats page component or restore the removed recent-attempt card.

- [ ] **Step 4: Run integrity and project checks**

Run:

```bash
npm run test:stats-integrity
npm run lint
npm run build
```

Expected: integrity tests pass; lint and build pass. If the repository has pre-existing failures, record their exact output and confirm no new failure points at the changed files.

- [ ] **Step 5: Commit the aggregation fix**

```bash
git add app/api/stats/route.ts scripts/test_stats_integrity.mts
git commit -m "fix(stats): aggregate only submitted answers"
```

Only commit when explicitly requested.

### Task 3: Preserve wrong-answer history when removing wrongbook items

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `lib/kv.ts`
- Modify: `lib/kv-sqlite.ts`
- Modify: `app/api/wrongbook/route.ts`
- Modify: `scripts/test_stats_integrity.mts`

- [ ] **Step 1: Write failing tests for dismissal semantics**

Add tests around a pure filter helper or storage fixture proving:

```ts
const history = [
  { questionId: "P3-exam-1", isCorrect: false },
  { questionId: "P3-exam-2", isCorrect: false },
];
const dismissed = new Set(["P3-exam-1"]);

assert.deepEqual(
  visibleWrongQuestionIds(history, dismissed),
  ["P3-exam-2"],
);
assert.equal(history.length, 2);
```

The test must prove dismissal filters the wrongbook view while leaving Answer history unchanged.

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npm run test:stats-integrity
```

Expected: failure because dismissal support does not exist.

- [ ] **Step 3: Add an additive dismissal model**

Add a model compatible with the schema's backward-compatibility rule:

```prisma
model WrongbookDismissal {
  id         String   @id
  sessionId  String
  questionId String
  createdAt  DateTime @default(now())

  @@unique([sessionId, questionId])
  @@index([sessionId])
  @@map("WrongbookDismissal")
}
```

Generate the Prisma client and create the repository's normal additive migration or schema bootstrap update. Do not modify or delete existing Answer rows.

- [ ] **Step 4: Extend the storage abstraction**

Add storage functions with consistent SQLite, KV, and in-memory behavior:

```ts
export async function listWrongbookDismissals(
  sessionId: string,
): Promise<string[]>;

export async function dismissWrongbookQuestion(
  sessionId: string,
  questionId: string,
): Promise<void>;
```

Use an idempotent key based on session and question ID. Repeated dismissal requests must succeed without duplicate records.

- [ ] **Step 5: Replace destructive DELETE behavior**

In `app/api/wrongbook/route.ts`:

- GET loads the dismissal set and excludes dismissed question IDs from the returned wrongbook list.
- DELETE calls `dismissWrongbookQuestion(sessionId, questionId)`.
- DELETE no longer rewrites Attempts or removes Answer rows.
- Return the same success shape currently consumed by the UI unless the existing route defines a more specific contract.

- [ ] **Step 6: Verify history preservation**

Run:

```bash
npm run test:stats-integrity
npm run lint
npm run build
```

Then use a disposable test database or route fixture to verify:

1. Count Answer rows before DELETE.
2. Dismiss one wrongbook question.
3. Count Answer rows after DELETE.
4. Assert counts are equal.
5. Assert the dismissed question is absent from GET `/api/wrongbook`.

- [ ] **Step 7: Commit the non-destructive wrongbook change**

```bash
git add prisma/schema.prisma lib/kv.ts lib/kv-sqlite.ts app/api/wrongbook/route.ts scripts/test_stats_integrity.mts
git commit -m "fix(wrongbook): preserve historical answers on removal"
```

Only commit when explicitly requested.

### Task 4: Correct latest-wrong timestamps

**Files:**
- Modify: `app/api/wrongbook/route.ts`
- Modify: `scripts/test_stats_integrity.mts`

- [ ] **Step 1: Add ordering-independent timestamp tests**

Provide wrong answers in ascending, descending, and mixed order. Assert `lastWrongAt` always equals the maximum Answer `createdAt` timestamp.

- [ ] **Step 2: Run the test and verify the route's current first-hit behavior fails**

Run:

```bash
npm run test:stats-integrity
```

Expected: the mixed/ascending fixture exposes the current incorrect first-error behavior.

- [ ] **Step 3: Aggregate wrongbook entries explicitly**

For each question ID, track:

```ts
{
  wrongCount: number;
  firstWrongAt: string;
  lastWrongAt: string;
}
```

Update `firstWrongAt` with the minimum timestamp and `lastWrongAt` with the maximum timestamp. Keep the existing response fields for compatibility and add `firstWrongAt` only if consumers tolerate additive fields.

- [ ] **Step 4: Run checks**

```bash
npm run test:stats-integrity
npm run lint
npm run build
```

Expected: all new assertions pass and existing consumers compile.

- [ ] **Step 5: Commit the timestamp fix**

```bash
git add app/api/wrongbook/route.ts scripts/test_stats_integrity.mts
git commit -m "fix(wrongbook): report the latest error timestamp"
```

Only commit when explicitly requested.

### Task 5: Detect and quarantine ungradeable question data

**Files:**
- Modify: `scripts/test_question_data.mts`
- Modify: question-loading or question-selection boundary identified in `lib/data.ts` after reading its full implementation
- Test data only if an authoritative source is found: `data/questions-p1-exam.json`, `data/questions-p1-mock.json`, `data/questions-p3-mock.json`

- [ ] **Step 1: Add exact validation failures**

Extend question data validation to report these conditions:

```ts
if (!question.answer?.trim()) {
  errors.push(`${question.id}: missing answer`);
}
if (!Array.isArray(question.options) || question.options.length === 0) {
  errors.push(`${question.id}: missing options`);
}
if (
  question.answer?.trim() &&
  Array.isArray(question.options) &&
  !question.options.some((option) => option.key === question.answer)
) {
  errors.push(`${question.id}: answer does not match an option`);
}
```

Adapt the option-key comparison to the repository's actual JSON option shape after reading the validator.

- [ ] **Step 2: Run validation and capture the known failures**

Run:

```bash
npx tsx scripts/test_question_data.mts
```

Expected: exact failures for:

- `P1-exam-117`: missing options
- `P1-mock-594`: missing answer
- `P3-mock-106`: missing answer
- `P3-mock-173`: missing answer
- `P3-mock-193`: missing answer
- `P3-mock-194`: missing answer

- [ ] **Step 3: Search authoritative sources without guessing**

Search repository history, source PDFs/HTML, imports, backups tracked by git, and documented upstream source references. Accept a correction only when the exact question and answer/options can be matched unambiguously.

If no authoritative source is present, do not edit the six JSON records. Instead, ensure the question-selection boundary excludes records lacking a valid answer/options and logs or reports their IDs during validation.

- [ ] **Step 4: Add quarantine regression coverage**

Test that normal question selection never returns an ungradeable record, while an admin/data-audit path can still list it for repair. Assert the available question count decreases by exactly six until authoritative repairs are supplied.

- [ ] **Step 5: Run all data checks**

```bash
npx tsx scripts/test_question_data.mts
npm run test:stats-integrity
npm run lint
npm run build
```

Expected: runtime selection is safe; the audit command either passes after authoritative corrections or intentionally reports the six quarantined records with a non-zero exit suitable for data-quality enforcement.

- [ ] **Step 6: Commit validation/quarantine behavior**

```bash
git add scripts/test_question_data.mts lib/data.ts data/questions-p1-exam.json data/questions-p1-mock.json data/questions-p3-mock.json
git commit -m "fix(data): quarantine ungradeable questions"
```

Only stage JSON files that were corrected from authoritative evidence, and only commit when explicitly requested.

### Task 6: Final consistency verification

**Files:**
- Verify only; no expected source changes

- [ ] **Step 1: Run focused checks**

```bash
npm run test:stats-integrity
npx tsx scripts/test_question_data.mts
```

Expected: statistics assertions pass; question audit reports no unknown anomalies beyond any deliberately quarantined records.

- [ ] **Step 2: Run repository checks**

```bash
npm run lint
npm run build
```

Expected: pass, or document exact pre-existing failures separately from this work.

- [ ] **Step 3: Inspect the final diff**

```bash
git diff --check
git diff -- app/stats/page.tsx
git status --short
```

Expected:

- no whitespace errors;
- `app/stats/page.tsx` still contains only the user's pre-existing removal of `RecentAttemptsCard`;
- no database file, generated cache, log, or backup artifact is included;
- no guessed question answers/options are present.

- [ ] **Step 4: Report metric semantics**

The completion report must state:

- `total` and `accuracy` use submitted Answer rows;
- zero-answer Attempts do not count as effective practice;
- wrongbook dismissal no longer destroys history;
- `lastWrongAt` is the maximum wrong-answer timestamp;
- legacy paper IDs are normalized only when evidence exists in question IDs;
- any unresolved ungradeable question IDs remain quarantined rather than guessed.
