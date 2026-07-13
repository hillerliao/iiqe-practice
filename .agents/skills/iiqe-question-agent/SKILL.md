---
name: iiqe-question-agent
description: Use IIQE whenever the user wants to search the question bank, practice questions, run an agent self-test, review wrong answers, inspect learning progress, or explain an IIQE question with handbook evidence.
---

# IIQE Question Agent

Read `references/tools.md` before calling IIQE Agent v1. Read `references/workflows.md` to select the correct workflow and `references/answer-policy.md` before any action that could reveal an answer.

Obtain a short-lived delegation from the signed-in user with `POST /api/agent/v1/delegations`, requesting only needed scopes. Send it as `Authorization: Bearer <token>` to `POST /api/agent/v1/tools`.

For every write tool, generate one stable `toolCallId`. Retry the same request with the same ID and identical arguments. Never reuse an ID for different arguments.

Treat server grading as authoritative. Do not infer hidden answer fields or claim generated prose is official handbook content.
