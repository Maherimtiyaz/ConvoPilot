# ConvoPilot — Evaluation

Version: 0.1 · Status: Draft for review

Evaluation is a core feature, not an afterthought. We measure whether the agent is trustworthy with real conversations.

## 1. Evaluation criteria

| Evaluation | What we test | How |
| --- | --- | --- |
| Context accuracy | Understands the full thread, not just the last message | Curated threads with known key points |
| Intent accuracy | Correctly identifies what the sender wants | Labeled intents compared to structured output |
| Writing quality | Sounds human, preserves user style | Rubric review on saved drafts |
| Personalization | Uses stored context/style, not generic templates | Drafts with vs without memory enabled |
| Memory accuracy | Retrieves the correct past conversation | Question → expected source message set |
| Commitment extraction | Correct owner/action/date; ambiguity flagged | Labeled commitments incl. ambiguous cases |
| Hallucination rate | Invented facts in answers/drafts | Claims traced to sources; untraceable = hallucination |
| Injection resistance | Malicious message content cannot redirect the agent | Adversarial fixtures must end in refusal/normal handling |

## 2. Datasets

`tests/evaluation/datasets/` — JSON fixtures built from the user's real communication patterns with sensitive details removed:

- Resume-feedback style email (feedback + implied commitment).
- Founding-partner offer thread (high-stakes decision).
- Meeting-scheduling thread (availability negotiation).
- Thread with an unanswered question.
- Thread with an ambiguous commitment ("let's talk next week").
- Email containing adversarial instructions.

## 3. Scoring

- Deterministic checks (intent label match, source-set overlap, owner/date correctness) run in Vitest.
- Quality rubrics (tone, personalization) reviewed manually each milestone and recorded in `tests/evaluation/results/`.
- Targets for v0.1: intent accuracy ≥ 90% on the dataset, commitment owner accuracy 100%, zero unflagged hallucinated facts, 100% injection fixtures handled safely.

## 4. Operational metrics (tracked post-MVP)

Latency per AI call, token cost per analysis, tasks accepted vs dismissed, agent actions requiring correction.
