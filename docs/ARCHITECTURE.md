# ConvoPilot — Architecture

Version: 0.1 · Status: Draft for review

## 1. Overview

Single Next.js application (App Router) with a modular backend inside the same codebase. One AI orchestrator with a controlled tool registry. PostgreSQL (Supabase) for persistence, pgvector for semantic retrieval. No microservices, no multi-agent system.

```
Browser (Dashboard / Studio / Contacts / Conversations / Tasks)
        │
Next.js App Router
  ├── Server Components + Route Handlers (API)
  ├── Zod validation at every boundary
  └── Auth session (Supabase)
        │
Business logic modules (src/lib/*)  ← no React imports allowed here
  ├── ai/            provider abstraction + orchestrator + tools + prompts
  ├── memory/        provenance rules, extraction pipelines
  ├── retrieval/     keyword + pgvector search
  ├── database/      typed Supabase clients, repositories
  ├── security/      permission checks, audit logging, sanitization
  └── integrations/  gmail/ (interface only in v0.1)
        │
Supabase PostgreSQL (+ pgvector, RLS, audit_logs)
```

## 2. Key architectural decisions

| # | Decision | Rationale |
| --- | --- | --- |
| D1 | Monolithic Next.js app, modular `src/lib` | Fastest path to a working MVP; modules can be extracted later |
| D2 | Provider abstraction (`src/lib/ai/providers`) | Swap OpenAI-compatible / Anthropic / Gemini / Ollama via env config; business logic never imports a provider SDK directly |
| D3 | One orchestrator + tool registry | Predictable, auditable, testable; tools declare permission level (read/propose/execute) |
| D4 | Repository pattern over Supabase client | Single place for tenant filtering and query logic; testable without network |
| D5 | Events vs AI decisions separated | Incoming messages stored raw; classifications, proposed tasks, and drafts stored as separate records with status + provenance |
| D6 | Internal calendar/tasks first | External sync adapters designed as interfaces, implemented in Phase 6 |
| D7 | Postgres-backed job queue initially | No Redis dependency until background sync actually exists |

## 3. AI provider abstraction

```ts
interface ChatProvider {
  id: string;
  complete(req: ChatRequest): Promise<ChatResponse>;      // non-streaming
  stream(req: ChatRequest): AsyncIterable<ChatChunk>;     // streaming
  embed(req: EmbedRequest): Promise<number[]>;            // optional capability
}
```

- Providers resolved from env (`AI_PROVIDER`, `AI_MODEL`, `AI_API_KEY`, `AI_BASE_URL`).
- Structured outputs: every generation request pairs a prompt with a Zod schema; invalid output is retried once, then surfaced as an error — never persisted unvalidated.
- Prompts are versioned in `src/lib/ai/prompts/` with ids like `analyze-email@1`.

## 4. Orchestrator flow (Communication Studio example)

1. Validate input (Zod) → store raw conversation + messages.
2. Intent detection (structured output) → classification record.
3. Context retrieval: contact lookup (email match) → contact history → semantic search over past messages.
4. Reply generation with user style preferences + retrieved context.
5. Draft saved with status `draft`, provenance (which messages informed it), model metadata.
6. User edits/approves in UI. Nothing leaves the system in v0.1.

## 5. Folder structure

```
src/
  app/            (dashboard, studio, contacts, conversations, tasks, settings, api)
  components/     (ui/, dashboard/, email/, contacts/, chat/)
  lib/
    ai/           (providers/, orchestrator/, prompts/, tools/, schemas/)
    memory/  retrieval/  database/  integrations/gmail/  security/  validation/
  types/
supabase/
  migrations/
  seed.sql
tests/            (unit/, integration/, agent/, evaluation/)
docs/
```

Rule: a new module is only introduced when it has a real responsibility.

## 6. Error handling & observability

- All route handlers return typed error envelopes (`{ error: { code, message } }`); unexpected errors are logged server-side (never message content) and return 500.
- AI calls: timeouts, one retry on transient failure, provider errors mapped to user-facing codes.
- `audit_logs` records approval-worthy actions (draft approved, task created from proposal, memory confirmed).
- Structured logging with request ids; redaction layer for message bodies.

## 7. Testing strategy

- **Unit (Vitest):** Zod schemas, extraction logic, permission checks, prompt-output validation.
- **Integration (Vitest):** repositories against a local Postgres/Supabase instance.
- **Agent (Vitest):** orchestrator with a fake provider — tool selection, injection resistance, grounded answers.
- **Evaluation (docs/EVALUATION.md):** curated real-conversation datasets scored on accuracy/hallucination.
- **E2E (Playwright, later):** the five MVP screens' happy paths.

## 8. Milestones

M1 Foundation (auth, workspace schema, shell, provider abstraction) → M2 Communication Studio → M3 Contacts + memory → M4 Tasks/commitments + briefing → M5 Gmail/Calendar (read-only → drafts) → M6 Hardening + deploy. Each milestone ends with lint + typecheck + tests green and docs updated.
