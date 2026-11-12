# ConvoPilot — Product Requirements Document (PRD)

Version: 0.1 (MVP) · Status: Draft for review · Owner: Mahek

## 1. Problem

Busy people (founders first) lose track of professional conversations, promises, and follow-ups across email, chat, and meetings. Generic AI chat tools have no memory of relationships and no accountability loop.

## 2. Product positioning

> ConvoPilot is an AI Chief of Staff that turns conversations into decisions, commitments, and completed work.

Target users (in order): solo founders and independent builders → busy professionals → students. The MVP is built for one primary user plus invited friends, with multi-user architecture from day one.

## 3. Locked product decisions

| Decision | Choice |
| --- | --- |
| Runtime | Local development first, cloud deploy later |
| AI strategy | Provider-agnostic abstraction (cloud APIs or local models) |
| Conversation intake | Manual paste/import first; Gmail designed now, implemented later |
| Users | Primary user + invited friends; workspace-aware data model |
| Calendar/tasks | Internal first; Google Calendar optional adapter later |
| Autonomy | Draft/propose everything; user approves anything external |
| Notifications (later) | Morning briefing + important real-time alerts |

## 4. MVP v0.1 — scope

Five screens only:

1. **Dashboard** — pending activities, recent conversations, quick actions.
2. **Communication Studio** — paste an email/thread, analyze intent, generate a professional reply, edit, copy, save.
3. **Contacts** — people, company, role, relationship context, linked history.
4. **Conversations** — stored imported threads, searchable, linked to contacts.
5. **Tasks** — commitments and follow-ups, including agent-proposed items awaiting approval.

Explicitly out of scope for v0.1: Gmail/Calendar sync, Slack/Discord, voice, desktop app, networking (ConvoPilot Connect), investor CRM, team features, billing.

## 5. Acceptance criteria (v0.1)

- [ ] I can paste a complete email thread.
- [ ] The agent understands the context (intent, main points, expected response).
- [ ] It produces a professional reply in my style.
- [ ] I can edit and save that reply as a draft.
- [ ] I can save the sender as a contact.
- [ ] I can retrieve the conversation later.
- [ ] I can ask what I previously discussed with that person and get source-linked answers.
- [ ] It can propose tasks from conversations.
- [ ] It does not invent commitments (ambiguous → proposal with confidence, not fact).
- [ ] It never sends a message without my approval.

## 6. Functional requirements

### FR-1 Communication Studio
- Paste email or full thread; optional "intended outcome" field.
- Structured analysis: sender intent, main points, expected response, urgency, risks.
- Reply generation with tone (direct/warm/formal) and length controls.
- Draft persistence with revisions; copy-to-clipboard. No sending in v0.1.

### FR-2 Contacts
- CRUD for contacts: name, email, company, role, relationship context, notes.
- Contact timeline: linked conversations, drafts, tasks, commitments.

### FR-3 Conversations
- Import (paste; `.txt`/`.md`/`.eml` file upload), store messages with provenance metadata (source, direction, participants, timestamps when known).
- Associate conversation with a contact; list + keyword search (semantic search when pgvector is enabled).

### FR-4 Tasks & commitments
- Manual CRUD: title, status, priority, due date, linked contact/conversation.
- Agent-extracted commitments enter an approval queue (proposed → approved/dismissed/edit).
- Two-way view: what I owe others, what others owe me.

### FR-5 Assistant chat (foundation for the orchestrator)
- Context-aware Q&A over the user's own stored conversations/contacts with evidence links.

### FR-6 Dashboard
- Counts: pending replies, open tasks, overdue items, recent conversations.
- Daily briefing summary generated from stored data (later phases: richer recommendations).

## 7. Non-functional requirements

- Strict tenant isolation (workspace_id + RLS) from the first migration.
- No raw message content in application logs.
- Provider-agnostic AI; provider config server-side only.
- Page interactions respond < 2s for stored data; AI calls stream with visible progress.
- Data export and deletion path documented (SECURITY.md).

## 8. Success metrics (post-MVP)

Commitments captured accurately, follow-ups completed on time, tasks accepted vs dismissed, weekly active usage, hallucination rate in memory answers (see EVALUATION.md).
