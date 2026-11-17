import { z } from "zod";

import type { TokenBudget } from "../budget";
import { validateCitations } from "../citations";
import { AiError } from "../errors";
import type { AiProvider } from "../provider";
import { parseJsonObject } from "../structured";
import { runToolLoop } from "../tool-loop";
import type { AuditSink } from "../tools/audit";
import { ToolRegistry } from "../tools/registry";
import type { AiContext, ModelMetadata } from "../types";
import { createNonce, wrapUntrusted } from "../untrusted";

/** Read-only data access the askHistory tools use. Implemented by a service (RLS applies). */
export interface HistorySource {
  searchContacts(query: string): Promise<{ id: string; name: string; emails: string[]; company: string | null }[]>;
  contactHistory(contactId: string): Promise<{ conversations: { id: string; subject: string; lastMessageAt: string | null }[]; recentMessages: HistoryMessage[] } | null>;
  searchMessages(query: string, contactId: string | null): Promise<HistoryMessage[]>;
}

export interface HistoryMessage {
  id: string;
  workspaceId: string;
  conversationId: string;
  subject: string;
  position: number;
  senderName: string | null;
  senderEmail: string | null;
  sentAt: string | null;
  body: string;
}

export interface HistoryCitation {
  messageId: string;
  conversationId: string;
  subject: string;
  position: number;
  senderName: string | null;
  sentAt: string | null;
  quote: string | null;
}

export type HistoryAnswer =
  | { status: "answered"; answer: string; citations: HistoryCitation[]; metadata: ModelMetadata }
  | { status: "no_record"; metadata: ModelMetadata }
  | { status: "incomplete"; metadata: ModelMetadata };

const PROMPT = { id: "ask-history", version: 1 } as const;

const finalAnswer = z.object({
  found: z.boolean(),
  answer: z.string().max(3000),
  citations: z.array(z.object({ ref: z.string().regex(/^M\d{1,3}$/), quote: z.string().min(1).max(300) })).max(10),
});

const SYSTEM = [
  "You are ConvoPilot. You answer the user's question about their own past conversations, using only what the tools return.",
  "Tools: search_contacts finds people by name or email; get_contact_history returns a contact's conversations and recent messages; search_messages does a keyword search (optionally for one contact).",
  "Each message a tool returns has a reference like M1. Base every statement on those messages.",
  "When you are done, reply with exactly one JSON object and nothing else:",
  '{"found": true|false, "answer": "short plain answer", "citations": [{"ref": "M1", "quote": "short text copied exactly from that message"}]}',
  'If the tools return nothing relevant, reply {"found": false, "answer": "", "citations": []}. Never guess or use outside knowledge.',
].join("\n");

/**
 * askHistory workflow (docs/AGENT_DESIGN.md §3): bounded read-only tool loop (≤ 4 rounds), then
 * citation validation against the messages the tools actually returned in this request.
 */
export async function askHistory(
  provider: AiProvider,
  ctx: AiContext,
  question: string,
  source: HistorySource,
  audit: AuditSink,
  budget: TokenBudget,
): Promise<HistoryAnswer> {
  const nonce = createNonce();
  const seen = new Map<string, HistoryMessage>(); // ref → message
  const refOf = new Map<string, string>(); // message id → ref
  const expose = (m: HistoryMessage) => {
    let ref = refOf.get(m.id);
    if (!ref) {
      ref = `M${seen.size + 1}`;
      seen.set(ref, m);
      refOf.set(m.id, ref);
    }
    return { ref, conversation: m.subject, from: m.senderName ?? m.senderEmail ?? "unknown", sent_at: m.sentAt, text: m.body.slice(0, 1500) };
  };

  const registry = new ToolRegistry()
    .register({
      name: "search_contacts",
      description: "Find the user's contacts by name or email.",
      permission: "read",
      args: z.object({ query: z.string().trim().min(1).max(100) }).strict(),
      run: async (_ctx, args) => (await source.searchContacts(args.query)).slice(0, 10),
    })
    .register({
      name: "get_contact_history",
      description: "A contact's conversations and their most recent messages.",
      permission: "read",
      args: z.object({ contactId: z.uuid() }).strict(),
      run: async (_ctx, args) => {
        const h = await source.contactHistory(args.contactId);
        return h ? { conversations: h.conversations.slice(0, 20), recent_messages: h.recentMessages.slice(0, 8).map(expose) } : { error: "contact not found" };
      },
    })
    .register({
      name: "search_messages",
      description: "Keyword search over the user's messages, optionally limited to one contact.",
      permission: "read",
      args: z.object({ query: z.string().trim().min(1).max(200), contactId: z.uuid().optional() }).strict(),
      run: async (_ctx, args) => (await source.searchMessages(args.query, args.contactId ?? null)).slice(0, 8).map(expose),
    });

  const user = `The user's question (written by the user):\n${wrapUntrusted([{ label: "question", content: question }], nonce).text}`;
  const result = await runToolLoop({ provider, ctx, registry, audit, budget, system: SYSTEM, user, nonce, maxOutputTokens: 4_000 });
  const metadata: ModelMetadata = { provider: provider.id, model: result.model, promptId: PROMPT.id, promptVersion: PROMPT.version, usage: result.usage };
  if (result.status === "incomplete") return { status: "incomplete", metadata };

  const parsed = parseJsonObject(result.text);
  const answer = parsed.ok ? finalAnswer.safeParse(parsed.value) : null;
  if (!answer?.success) throw new AiError("invalid_output");
  if (!answer.data.found || answer.data.answer.trim() === "") return { status: "no_record", metadata };

  const supplied = [...seen.values()].map((m) => ({ id: m.id, workspaceId: m.workspaceId, deleted: false, text: m.body }));
  const { valid } = validateCitations(
    answer.data.citations.map((c) => ({ sourceId: seen.get(c.ref)?.id ?? `unknown-${c.ref}`, quote: c.quote })),
    ctx.workspaceId,
    supplied,
  );
  // A factual answer without valid evidence is not shown (AGENT_DESIGN §6).
  if (valid.length === 0) return { status: "no_record", metadata };
  return {
    status: "answered",
    answer: answer.data.answer.trim(),
    citations: valid.map((c) => {
      const m = [...seen.values()].find((x) => x.id === c.sourceId)!;
      return { messageId: m.id, conversationId: m.conversationId, subject: m.subject, position: m.position, senderName: m.senderName, sentAt: m.sentAt, quote: c.quote ?? null };
    }),
    metadata,
  };
}
