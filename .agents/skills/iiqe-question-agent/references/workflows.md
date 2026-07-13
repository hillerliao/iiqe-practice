# Workflows

## Learner practice

1. Optionally inspect learning summary or wrong questions.
2. Select prompt-safe questions with `list_questions`.
3. Create an attempt with `start_attempt`.
4. Present one question at a time.
5. Submit each learner response with `submit_answer`. Use `feedbackMode: "deferred"` when explanations should wait until the end.
6. Call `finish_attempt`, then `get_attempt_result`.
7. Summarize score, mistakes, official explanations, and handbook links.

## Agent self-test

Select and start an attempt before reasoning about answers. Submit the agent's answer before calling any result or explanation tool. Do not use `explain_question` during the test. State that the result evaluates the agent, not the user's knowledge.

## Direct explanation

Only when the user explicitly requests an answer or explanation, call `explain_question` with `mode: "explain"`. Clearly separate official question-bank explanation from any additional reasoning.
