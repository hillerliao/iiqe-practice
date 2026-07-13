# Tool reference

Discover tools with `GET /api/agent/v1/tools`. Call them with `POST /api/agent/v1/tools` using `{ "tool", "toolCallId?", "arguments" }`.

Scopes: `practice:read`, `practice:write`, and `learning:read`.

- `list_papers`: no arguments.
- `list_questions`: `paperCode`, optional `source`, `query`, `limit` (max 50), `offset`. Never returns answers.
- `start_attempt`: `paperId`, `source`, `mode`, `questionIds` (max 100). Write tool.
- `get_attempt`: `attemptId`. Returns ordered prompt-safe questions.
- `submit_answer`: `attemptId`, `questionId`, `userAnswer`, optional `timeSpentMs`, `feedbackMode` (`deferred` by default or `immediate`). Write tool.
- `finish_attempt`: `attemptId`. Write tool.
- `get_attempt_result`: `attemptId`; only succeeds after finish and then reveals official answers and explanations.
- `get_learning_summary`: no arguments.
- `list_wrong_questions`: optional `limit` (max 50); returns prompt-safe questions.
- `explain_question`: `questionId`, `mode: "explain"`; use only for an explicit explanation request.

Successful responses use `{ "ok": true, "requestId", "data" }`. Failures use `{ "ok": false, "requestId", "error": { "code", "message" } }`.
