import "server-only";

import { z } from "zod";

import type { RequestContext } from "@/lib/auth/context";
import { DEFAULT_BUDGETS } from "@/lib/ai/budget";
import { askHistory, type HistoryAnswer, type HistoryMessage, type HistorySource } from "@/lib/ai/workflows/ask-history";
import { createSupabaseAuditSink } from "@/lib/ai/tools/supabase-audit";
import { createSupabaseServerClient, type SupabaseServerContext } from "@/lib/supabase/server";

import { withAi } from "./ai-runtime";
import { StudioError } from "./studio";

const db = (context: SupabaseServerContext) => createSupabaseServerClient(context);

const contactRow = z.object({
  id: z.uuid(),
  full_name: z.string(),
  role_title: z.string().nullable(),
  relationship_context: z.string().nullable(),
  last_interaction_at: z.string().nullable(),
  created_at: z.string(),
  companies: z.object({ name: z.string() }).nullable(),
  contact_identifiers: z.array(z.object({ value_normalized: z.string() })),
  conversation_participants: z.array(z.object({ conversation_id: z.uuid() })),
});

export interface ContactSummary {
  id: string;
  name: string;
  company: string | null;
  roleTitle: string | null;
  notes: string | null;
  emails: string[];
  conversationCount: number;
  lastInteractionAt: string | null;
}

const SELECT = "id, full_name, role_title, relationship_context, last_interaction_at, created_at, companies(name), contact_identifiers(value_normalized), conversation_participants(conversation_id)";

function toSummary(r: z.infer<typeof contactRow>): ContactSummary {
  return {
    id: r.id,
    name: r.full_name,
    company: r.companies?.name ?? null,
    roleTitle: r.role_title,
    notes: r.relationship_context,
    emails: r.contact_identifiers.map((i) => i.value_normalized),
    conversationCount: new Set(r.conversation_participants.map((p) => p.conversation_id)).size,
    lastInteractionAt: r.last_interaction_at,
  };
}

export async function listContacts(ctx: RequestContext, query?: string): Promise<ContactSummary[]> {
  const supabase = await db("server-component");
  let q = supabase.from("contacts").select(SELECT).eq("workspace_id", ctx.workspaceId).order("last_interaction_at", { ascending: false, nullsFirst: false }).limit(200);
  if (query) q = q.ilike("full_name", `%${query.replace(/[%_\\]/g, "")}%`);
  const { data, error } = await q;
  if (error) throw new StudioError("failed");
  return z.array(contactRow).parse(data).map(toSummary);
}

export interface ContactDetail extends ContactSummary {
  conversations: { id: string; subject: string; createdAt: string; messageCount: number }[];
}

export async function getContact(ctx: RequestContext, id: string, context: SupabaseServerContext = "server-component"): Promise<ContactDetail> {
  const supabase = await db(context);
  const { data, error } = await supabase.from("contacts").select(SELECT).eq("id", id).eq("workspace_id", ctx.workspaceId).maybeSingle();
  if (error) throw new StudioError("failed");
  if (!data) throw new StudioError("not_found");
  const summary = toSummary(contactRow.parse(data));
  const convIds = [...new Set(contactRow.parse(data).conversation_participants.map((p) => p.conversation_id))];
  let conversations: ContactDetail["conversations"] = [];
  if (convIds.length > 0) {
    const { data: convs, error: convError } = await supabase.from("conversations").select("id, subject, created_at, message_count").in("id", convIds).order("created_at", { ascending: false });
    if (convError) throw new StudioError("failed");
    conversations = z
      .array(z.object({ id: z.uuid(), subject: z.string(), created_at: z.string(), message_count: z.number() }))
      .parse(convs)
      .map((c) => ({ id: c.id, subject: c.subject, createdAt: c.created_at, messageCount: c.message_count }));
  }
  return { ...summary, conversations };
}

/** Email → contact id, for showing "Save as contact" or "View contact" next to senders. */
export async function contactIdsByEmail(ctx: RequestContext, emails: string[]): Promise<Record<string, string>> {
  const list = [...new Set(emails.filter(Boolean).map((e) => e.toLowerCase()))];
  if (list.length === 0) return {};
  const supabase = await db("server-component");
  const { data, error } = await supabase.from("contact_identifiers").select("value_normalized, contact_id").eq("workspace_id", ctx.workspaceId).eq("kind", "email").in("value_normalized", list);
  if (error) throw new StudioError("failed");
  return Object.fromEntries(z.array(z.object({ value_normalized: z.string(), contact_id: z.uuid() })).parse(data).map((r) => [r.value_normalized, r.contact_id]));
}

export type SaveContactResult = { status: "created" | "existing"; contactId: string } | { status: "invalid" };

export async function saveContact(ctx: RequestContext, input: { name: string; email?: string; company?: string; roleTitle?: string }): Promise<SaveContactResult> {
  const supabase = await db("server-action");
  const { data, error } = await supabase.rpc("save_contact", {
    p_workspace_id: ctx.workspaceId,
    p_full_name: input.name,
    p_email: input.email || null,
    p_company: input.company || null,
    p_role_title: input.roleTitle || null,
  });
  if (error) throw new StudioError("failed");
  const r = z.object({ status: z.enum(["created", "existing", "invalid"]), contact_id: z.uuid().optional() }).parse(data);
  return r.status === "invalid" || !r.contact_id ? { status: "invalid" } : { status: r.status, contactId: r.contact_id };
}

export async function updateContact(ctx: RequestContext, id: string, input: { name: string; roleTitle: string | null; notes: string | null }): Promise<void> {
  const supabase = await db("server-action");
  const { data, error } = await supabase
    .from("contacts")
    .update({ full_name: input.name, role_title: input.roleTitle, relationship_context: input.notes })
    .eq("id", id)
    .eq("workspace_id", ctx.workspaceId)
    .select("id");
  if (error) throw new StudioError("failed");
  if (!data?.length) throw new StudioError("not_found");
}

export async function deleteContact(id: string): Promise<void> {
  const supabase = await db("server-action");
  const { error } = await supabase.rpc("soft_delete_contact", { p_contact_id: id });
  if (error) throw new StudioError("failed");
}

// ---------------------------------------------------------------- retrieval
const hitRow = z.object({
  message_id: z.uuid(),
  conversation_id: z.uuid(),
  subject: z.string(),
  message_position: z.number(),
  sender_name: z.string().nullable(),
  sender_email: z.string().nullable(),
  sent_at: z.string().nullable(),
  body_text: z.string(),
});

export async function searchMessages(ctx: RequestContext, query: string, contactId: string | null = null, context: SupabaseServerContext = "server-component"): Promise<HistoryMessage[]> {
  if (query.trim().length === 0 || query.length > 200) return [];
  const supabase = await db(context);
  const { data, error } = await supabase.rpc("search_messages", { p_workspace_id: ctx.workspaceId, p_query: query, p_contact_id: contactId, p_limit: 20 });
  if (error) throw new StudioError("failed");
  return z.array(hitRow).parse(data).map((r) => ({
    id: r.message_id,
    workspaceId: ctx.workspaceId,
    conversationId: r.conversation_id,
    subject: r.subject,
    position: r.message_position,
    senderName: r.sender_name,
    senderEmail: r.sender_email,
    sentAt: r.sent_at,
    body: r.body_text,
  }));
}

/** History data for the askHistory tools, read with the user's session (RLS applies). */
function historySource(ctx: RequestContext): HistorySource {
  return {
    async searchContacts(query) {
      const supabase = await db("server-action");
      const term = query.replace(/[%_\\,()]/g, "").toLowerCase();
      const [byName, byEmail] = await Promise.all([
        supabase.from("contacts").select("id").eq("workspace_id", ctx.workspaceId).ilike("full_name", `%${term}%`).limit(10),
        supabase.from("contact_identifiers").select("contact_id").eq("workspace_id", ctx.workspaceId).ilike("value_normalized", `%${term}%`).limit(10),
      ]);
      if (byName.error || byEmail.error) throw new StudioError("failed");
      const ids = [...new Set([...(byName.data ?? []).map((r) => r.id as string), ...(byEmail.data ?? []).map((r) => r.contact_id as string)])].slice(0, 10);
      const contacts = await Promise.all(ids.map((id) => getContact(ctx, id, "server-action").catch(() => null)));
      return contacts.filter((c) => c !== null).map((c) => ({ id: c.id, name: c.name, emails: c.emails, company: c.company }));
    },
    async contactHistory(contactId) {
      const contact = await getContact(ctx, contactId, "server-action").catch(() => null);
      if (!contact) return null;
      const supabase = await db("server-action");
      const convIds = contact.conversations.map((c) => c.id);
      let recentMessages: HistoryMessage[] = [];
      if (convIds.length > 0) {
        const { data, error } = await supabase
          .from("messages")
          .select("id, conversation_id, position, sender_name, sender_email, sent_at, body_text, created_at")
          .in("conversation_id", convIds)
          .order("created_at", { ascending: false })
          .limit(8);
        if (error) throw new StudioError("failed");
        const subjects = new Map(contact.conversations.map((c) => [c.id, c.subject]));
        recentMessages = (data ?? []).map((m) => ({
          id: m.id as string,
          workspaceId: ctx.workspaceId,
          conversationId: m.conversation_id as string,
          subject: subjects.get(m.conversation_id as string) ?? "",
          position: m.position as number,
          senderName: m.sender_name as string | null,
          senderEmail: m.sender_email as string | null,
          sentAt: m.sent_at as string | null,
          body: m.body_text as string,
        }));
      }
      return { conversations: contact.conversations.map((c) => ({ id: c.id, subject: c.subject, lastMessageAt: c.createdAt })), recentMessages };
    },
    searchMessages: (query, contactId) => searchMessages(ctx, query, contactId, "server-action"),
  };
}

export async function askAboutHistory(ctx: RequestContext, question: string): Promise<HistoryAnswer> {
  return withAi(ctx, DEFAULT_BUDGETS.askHistory, (provider, budget) =>
    askHistory(provider, { ...ctx, workflow: "askHistory" }, question, historySource(ctx), createSupabaseAuditSink(), budget),
  );
}
