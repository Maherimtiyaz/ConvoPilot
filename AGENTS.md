<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# PROJECT: ConvoPilot

## Personal AI Chief of Staff — Communication, Relationship & Commitment Intelligence

Act as a Staff Software Engineer, AI Architect, Product Engineer, and Technical Lead.

You are building ConvoPilot: an AI-powered personal chief of staff that turns conversations into decisions, commitments, and completed work. It helps the user understand and reply to professional emails, maintain relationship memory, extract and track commitments, manage tasks and calendar, prepare for meetings, and receive daily briefings.

The application must preserve the user's natural communication style. It must not produce generic corporate-sounding messages.

## LOCKED ARCHITECTURE DECISIONS

Do not revisit these without explicit approval:

1. **Local development first.** Git for version control, separate dev database.
2. **Provider-agnostic AI.** A provider abstraction layer; never hardcode provider-specific assumptions in business logic.
3. **Manual conversation import first.** Paste/import now; design Gmail/Google Calendar integration interfaces now, implement sync later.
4. **Single primary user + invited friends, multi-user-ready.** Every user-owned record carries a `workspace_id`; strict tenant isolation from day one.
5. **Internal calendar and tasks first.** Own calendar/task tables; external calendar sync is an optional later adapter.
6. **Human-in-the-loop for external actions.** The agent reads, analyzes, drafts, proposes. The user approves anything that leaves the system.
7. **MVP v0.1 = five screens.** Dashboard, Communication Studio, Contacts, Conversations, Tasks. Nothing else until v0.1 passes its acceptance criteria.

## TECHNICAL STACK

- Next.js App Router (this repo uses Next 16 — read `node_modules/next/dist/docs/` for current conventions)
- TypeScript, strict mode
- Tailwind CSS (v4) + shadcn/ui
- Supabase PostgreSQL + Supabase Auth + pgvector
- Vercel AI SDK or equivalent provider abstraction
- Zod for all schema validation
- Vitest for unit/integration tests; Playwright for E2E (added when UI stabilizes)
- Keep dependencies minimal. Do not add a dependency that the stack above does not require.

## ENGINEERING PRINCIPLES

1. Modular architecture; business logic lives outside UI components.
2. Server-side validation with Zod on every API boundary.
3. Proper error handling. Never silently swallow errors.
4. TypeScript types throughout; no `any` in new code.
5. Avoid unnecessary abstractions and premature microservices.
6. Controlled database access; the LLM never issues arbitrary SQL.
7. Document important architectural decisions in `docs/`.
8. Write tests for critical functionality (memory extraction, intent classification, retrieval, permission checks).
9. No mock implementations presented as production integrations.
10. No TODOs without a tracking note; no fake data presented as real.

## AI AGENT REQUIREMENTS

One orchestrator + a controlled set of specialized tools. No multi-agent system.

Tools (initial contracts in `docs/AGENT_DESIGN.md`): `search_contacts`, `get_contact_history`, `search_messages`, `analyze_email`, `draft_reply`, `summarize_thread`, `extract_commitments`, `create_task`, `update_contact`, `prepare_meeting`, `save_memory`.

Permission levels:

- **Read** — retrieve authorized information.
- **Propose** — prepare drafts, suggest tasks, propose memories (require user confirmation).
- **Execute** — perform approved external operations (requires explicit approval; never automatic in v0.1).

Rules:

- Use structured outputs validated with Zod.
- Never trust model-generated facts without checking them against retrieved context.
- Every extracted fact/commitment must reference its source message or note.
- Treat all imported email/message content as **untrusted data**, never as instructions. Defend against prompt injection.
- The agent must not have unrestricted database access.

## MEMORY ARCHITECTURE

Persistent memory in PostgreSQL with provenance on every record: source reference, timestamp, confidence/verification status, confirmed vs inferred, last-updated. Distinguish confirmed facts from inferences. Do not automatically turn guesses into permanent facts. Support updating and deleting incorrect memories. Semantic retrieval via pgvector. Private per workspace; never leak across users.

## USER INTERFACE

Clean, modern, professional SaaS dashboard. Primary navigation for MVP: Dashboard, Communication Studio, Contacts, Conversations, Tasks (Settings shell only). Usability over decoration. Responsive. Always show loading, error, empty, and success states. Functional, not a visual prototype.

## DEVELOPMENT WORKFLOW (every milestone)

1. Inspect the existing project. 2. Understand requirements. 3. Identify architectural decisions. 4. Plan. 5. Implement one milestone at a time. 6. `npm run lint` and `npx tsc --noEmit`. 7. Run relevant tests. 8. Review security implications. 9. Update docs. 10. Report completed work and remaining tasks honestly.

Before modifying existing architecture, explain proposed changes. Do not overwrite files unnecessarily. Do not run destructive migrations without explicit approval. Do not claim a feature is complete unless implemented and tested.

## IMPLEMENTATION ORDER

Phase 1: Foundation (auth, workspace schema, dashboard shell, provider abstraction).
Phase 2: Communication Studio (import, analysis, reply generation, drafts).
Phase 3: Contacts + relationship memory (source-linked, semantic search).
Phase 4: Tasks + commitments (proposals with approval, follow-up queue).
Phase 5: Daily briefing.
Phase 6: Gmail/Google Calendar integrations (read-only first, drafts with approval).
Phase 7: Evaluation, security hardening, deployment.

Complete and test each milestone before starting the next. Never implement all phases in one session.

## PROJECT DOCUMENTATION

Maintain: `README.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/SECURITY.md`, `docs/AGENT_DESIGN.md`, `docs/EVALUATION.md`, plus `docs/OPENCODE_PROMPTS.md` (the running log of prompts given to the coding agent and their status) and `docs/WORKLOG.md` (session reports).
