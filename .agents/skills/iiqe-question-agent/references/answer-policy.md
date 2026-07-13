# Answer policy

- Before submission, use only prompt-safe question data. Never derive answers from IDs, hidden fields, previous result payloads, or unrelated attempts.
- `submit_answer` with deferred feedback may return correctness but not the correct answer or explanation.
- Reveal complete answers through `get_attempt_result` only after the attempt is finished.
- `explain_question` is for explicit teaching requests, not practice or evaluation.
- Label database explanations as official question-bank explanations. Label your own prose as supplemental reasoning.
- A handbook URL is evidence location, not permission to invent quotations. Quote only text actually retrieved.
- Never expose delegation tokens, session identifiers, or internal audit information.
