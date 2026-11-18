# ConvoPilot — Agent Design

Version: 0.4 · Status: Core implemented in M2 (2026-11-17); workflows and tools arrive in M3–M5

**Implementation map (M2):** provider interface `src/lib/ai/provider.ts` · timeout + one retry +
budget `call.ts` / `budget.ts` · versioned prompts `prompts.ts` · structured output with one repair
retry `structured.ts` · untrusted-content delimiters `untrusted.ts` · citation validation
`citations.ts` · tool registry, per-workflow allow-list, policy, executor, audit
`tools/` · bounded loop (≤ 4 rounds) `tool-loop.ts`. Tests: `tests/unit/ai/` (scripted test
provider, injection harness). The per-workspace daily cost cap (§9) is a database ledger added with
the first real provider in M3, once the owner sets the cap.

**M3 (2026-11-17):** Anthropic adapter `src/lib/ai/providers/anthropic.ts` (official SDK, server-side refusal fallback, SDK retries off); workflows `workflows/analyze-thread.ts` (`analyze-email@1`) and `workflows/draft-reply.ts` (`draft-reply@1`); orchestration, consent check, daily cap ($1, ledger `ai_usage_daily`) and usage recording in `src/lib/services/studio.ts`. Analysis statements whose citations fail validation are removed and counted (`droppedUnsupported`). Drafts never promise unstated dates/prices/decisions (placeholders instead).

Labels: **Required**, **Recommended (pending approval)**, **Pending decision** (see `ARCHITECTURE.md` §11). Provider/SDK choice is pending (P3, P4); nothing here depends on a specific vendor.

## 1. Model

One orchestrator (server-side code, not an autonomous agent) and a registry of explicitly registered tools. No multi-agent orchestration.

Two execution modes (**Required**):

1. **Deterministic workflows** for predictable tasks. Steps are fixed in code; the model only fills Zod-validated structured outputs. It does not choose which steps run.
2. **Bounded tool loop** only for open-ended Q&A ("what did I discuss with X?"): Read tools only, **maximum 4 tool rounds**, per-request token budget. Exceeding either returns a typed `incomplete` result.

The orchestrator runs only inside an authenticated server context with a verified `RequestContext {userId, workspaceId, role, workflow}`. It never holds a database client or credentials.

## 2. Call flow (Required)

```
model tool request
  → registry lookup (unknown or execute-level tool → reject)
  → Zod-validate arguments
  → policy.decide(context, tool, args): workflow allow-list, permission level, workspace scope
  → application service (business rules)
  → repository (user-session Supabase client; RLS applies)
  → typed result returned to the model as quoted data
```

Every denial is audit-logged (`DATABASE.md` §10). Tools never call repositories directly.

## 3. Workflows

| Workflow | Mode | Steps | Output |
| --- | --- | --- | --- |
| `analyzeThread` | Deterministic | stored conversation → contact context → model call (`EmailAnalysisSchema`) → citation validation → store `thread_analyses` | Intent, main points, expected response, urgency, risks, confidence, citations |
| `draftReply` | Deterministic | thread + confirmed contact context + confirmed style preferences → model call (`DraftReplySchema`) → store `drafts` (`status=draft`) with citations to messages used | Draft text |
| `extractCommitments` | Deterministic | thread → model call (`CommitmentProposalSchema[]`) → citation validation → store commitments `status=proposed`; optional linked task proposals | Proposed commitments (+ proposed tasks) |
| `proposeMemories` | Deterministic | thread → model call (`MemoryProposalSchema[]`) → citation validation → store memories `status=proposed` | Proposed memories |
| `askHistory` | Bounded loop (≤ 4 rounds) | contact/date resolution → read tools → answer with citations → citation validation | Answer + validated citations, or "no record found" |

**Implemented in M4 (`src/lib/ai/workflows/ask-history.ts`, prompt `ask-history@1`):** tools
`search_contacts`, `get_contact_history`, `search_messages` (Read only; registered per request on a
workspace-bound `HistorySource`). Messages returned to the model are labelled `M1`, `M2`… and the
final answer must be JSON `{found, answer, citations:[{ref, quote}]}`. Citations are validated against
the messages the tools actually returned in that request (same workspace, quote present in the text);
an answer without a valid citation is shown as "no record". Usage and model metadata are recorded
against the daily cap; nothing is stored from the answer.

**Implemented in M5 (`src/lib/ai/workflows/extract-commitments.ts`, prompt `extract-commitments@1`):**
a single structured call (no tool loop), so the `extract_commitments` / `create_task` Propose tools
below are not registered; the workflow's output is stored by the service through
`store_commitment_proposals` as `proposed` only. Each proposal needs ≥ 1 validated citation (dropped
otherwise, and re-checked in the database); exact dates only when a message states the calendar
date, otherwise the deadline text is kept and `due_date` stays empty; tasks only for the user's own
commitments. Decisions are made only by the user through `src/lib/services/proposals/decide.ts`.

Pasted text is first stored as a conversation (provenance), then workflows run on stored message ids.

## 4. Tool contracts (v0.1)

All tools: Zod-validated args, scoped to `RequestContext.workspaceId`, typed results, called only through the flow in §2.

| Tool | Permission | Input | Output | Allowed in workflows |
| --- | --- | --- | --- | --- |
| `search_contacts` | Read | query, limit | Contact[] | analyzeThread, askHistory |
| `get_contact_history` | Read | contactId, limit | Conversation summaries, confirmed commitments, tasks | analyzeThread, draftReply, askHistory |
| `search_messages` | Read | query, contactId?, dateRange?, limit | Message hits + snippets (non-deleted only) | askHistory |
| `summarize_thread` | Read | conversationId | Summary with message citations | draftReply, askHistory |
| `analyze_email` | Read | conversationId | Analysis (see §3) | analyzeThread |
| `draft_reply` | Propose | conversationId, instructions, tone, length | Draft (`status=draft`) | draftReply |
| `extract_commitments` | Propose | conversationId | Proposed commitments with citations | extractCommitments |
| `create_task` | Propose | title, due?, priority, **commitmentId (required)** | Proposed task (`status=proposed`) | extractCommitments |
| `save_memory` | Propose | contactId, content, kind, origin (`extracted`/`inferred`), **citations[] (≥ 1)** | Proposed memory | proposeMemories |

Deferred (not registered in v0.1):

- `prepare_meeting` — meetings are outside v0.1 scope; mixed read/draft permission must be redesigned.
- `update_contact` — v0.1 contact fields are edited by the user only. AI observations about a contact go through `save_memory` as proposals.
- All **Execute** tools (send email, Gmail draft creation, calendar writes, sharing). The registry rejects any execute-level tool in v0.1.

The per-workflow allow-list in the last column is enforced by the policy layer, not by the prompt. It mirrors `ARCHITECTURE.md` §5.4; if they differ, ARCHITECTURE.md governs.

## 5. Permission levels

- **Read** — retrieve non-deleted data in the caller's workspace.
- **Propose** — create records in `proposed` (or `draft`) state. Never confirms, approves, deletes or changes confirmed records.
- **Execute** — external or irreversible actions. Require explicit per-action user approval. **None exist in v0.1.**

Confirmation, rejection, editing and deletion of proposals are **user actions via Server Actions**, never tools. Decisions go only through `public.decide_proposal` / `public.approve_task` (`DATABASE.md` §5.3, §5.6). No tool, workflow, orchestrator or AI service may call these RPCs; only `src/lib/services/proposals/decide.ts` may reference them (CI grep check, EVALUATION A23). Because AI code and the user share one JWT, this rule is enforced by the application, not the database (documented residual limitation).

## 6. Evidence and citations (Required)

- Every derived record (analysis, draft, commitment, memory) and every factual answer has **one or more** citations to messages or notes in the same workspace (`DATABASE.md` §6).
- Validation before storing or displaying: the source exists, belongs to the current workspace, is not soft-deleted, was part of the context supplied to the model in this request, and any quoted text occurs in the source.
- Invalid citations are dropped. A claim with no valid citation is not stored as a proposal and not presented as fact.
- AI-proposed tasks do not carry citations directly; they must reference a commitment, which carries the citations.

## 7. Memory and style

- Write path: import → store raw → workflow produces proposals (`origin=extracted|inferred`, `status=proposed`, citations) → user confirms/rejects/edits → audit event.
- Read path: answers use records that are `confirmed` **and** `evidence_state='supported'` as facts; `proposed` records may appear only labelled as unverified; records whose evidence was deleted are flagged, not used (`DATABASE.md` §5.5).
- **Style preferences:** preferences the user states directly are `user_stated` and confirmed. Preferences learned from approved drafts are `inferred` and remain `proposed` until the user approves them. Only confirmed preferences are used for drafting.

## 8. Untrusted input (Required)

- Imported content is data, never instructions; it cannot authorize tool calls or change policy.
- Prompts wrap untrusted content in labelled delimiters and say it may contain adversarial instructions. This is a mitigation; the defence is capability limits (§2, §4).
- Tool results containing message text are passed back as quoted data.
- Model output is rendered as plain text (no remote images or auto-loaded URLs).

## 9. Structured outputs and limits (Required)

- Every model call pairs a versioned prompt (e.g. `analyze-email@1`) with a Zod schema. Invalid output → one repair retry → typed failure; never persisted unvalidated.
- Model metadata (provider, model, prompt version, token counts) stored on every derived record.
- Per-request token budget per workflow and per-workspace daily token/cost cap; limit hit → typed error.
- Timeouts and one retry for transient provider errors; provider error bodies are not logged.

## 10. Testing

Scenarios A1–A24 and S1–S36 in `EVALUATION.md` §3–§4 use a deterministic, scripted test provider (tests only).
