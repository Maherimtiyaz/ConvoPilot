import type { SupabaseClient } from "@supabase/supabase-js";
import { notFound } from "@/lib/errors";
import type { Classification, Contact, Conversation, Draft, Message } from "@/types/database";

/**
 * Repositories are the only place that touches Supabase tables. Every query
 * is scoped by workspace_id (RLS is the second line of defense).
 */

export async function getWorkspaceId(supabase: SupabaseClient, userId: string): Promise<string> {
  const { data, error } = await supabase
    .from("users")
    .select("workspace_id")
    .eq("id", userId)
    .single<{ workspace_id: string }>();
  if (error || !data) throw notFound("User record not found. Is the database migration applied?");
  return data.workspace_id;
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export async function findContactByEmail(
  supabase: SupabaseClient,
  workspaceId: string,
  email: string,
): Promise<Contact | null> {
  const { data } = await supabase
    .from("contacts")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("email", email)
    .is("deleted_at", null)
    .maybeSingle<Contact>();
  return data ?? null;
}

export async function createContact(
  supabase: SupabaseClient,
  workspaceId: string,
  input: { full_name: string; email: string | null; relationship_context?: string },
): Promise<Contact> {
  const { data, error } = await supabase
    .from("contacts")
    .insert({ workspace_id: workspaceId, ...input })
    .select("*")
    .single<Contact>();
  if (error) throw new Error(`Failed to create contact: ${error.message}`);
  return data;
}

// ---------------------------------------------------------------------------
// Conversations & messages
// ---------------------------------------------------------------------------

export async function createConversation(
  supabase: SupabaseClient,
  workspaceId: string,
  input: { contact_id: string | null; subject: string | null; source_type: Conversation["source_type"] },
): Promise<Conversation> {
  const { data, error } = await supabase
    .from("conversations")
    .insert({ workspace_id: workspaceId, ...input })
    .select("*")
    .single<Conversation>();
  if (error) throw new Error(`Failed to create conversation: ${error.message}`);
  return data;
}

export async function insertMessages(
  supabase: SupabaseClient,
  workspaceId: string,
  conversationId: string,
  messages: Omit<Message, "id" | "workspace_id" | "conversation_id" | "created_at">[],
): Promise<Message[]> {
  const rows = messages.map((m) => ({ ...m, workspace_id: workspaceId, conversation_id: conversationId }));
  const { data, error } = await supabase.from("messages").insert(rows).select("*");
  if (error) throw new Error(`Failed to store messages: ${error.message}`);
  return data as Message[];
}

export async function getConversationWithMessages(
  supabase: SupabaseClient,
  workspaceId: string,
  conversationId: string,
): Promise<{ conversation: Conversation; messages: Message[] }> {
  const { data: conversation, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", conversationId)
    .is("deleted_at", null)
    .maybeSingle<Conversation>();
  if (error) throw new Error(`Failed to load conversation: ${error.message}`);
  if (!conversation) throw notFound("Conversation not found");

  const { data: messages, error: messagesError } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (messagesError) throw new Error(`Failed to load messages: ${messagesError.message}`);

  return { conversation, messages: (messages ?? []) as Message[] };
}

export async function updateConversationContact(
  supabase: SupabaseClient,
  workspaceId: string,
  conversationId: string,
  contactId: string,
): Promise<void> {
  const { error } = await supabase
    .from("conversations")
    .update({ contact_id: contactId })
    .eq("workspace_id", workspaceId)
    .eq("id", conversationId);
  if (error) throw new Error(`Failed to link contact: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Classifications
// ---------------------------------------------------------------------------

export async function saveClassification(
  supabase: SupabaseClient,
  workspaceId: string,
  input: {
    message_id: string;
    intent: string;
    urgency: Classification["urgency"];
    summary: string;
    expected_response: string;
    confidence: number;
    model_metadata: Record<string, unknown>;
  },
): Promise<Classification> {
  const { data, error } = await supabase
    .from("classifications")
    .insert({ workspace_id: workspaceId, ...input })
    .select("*")
    .single<Classification>();
  if (error) throw new Error(`Failed to save classification: ${error.message}`);
  return data;
}

// ---------------------------------------------------------------------------
// Drafts
// ---------------------------------------------------------------------------

export async function createDraft(
  supabase: SupabaseClient,
  workspaceId: string,
  input: {
    conversation_id: string;
    contact_id: string | null;
    content: string;
    tone: string;
    model_metadata: Record<string, unknown>;
  },
): Promise<Draft> {
  const { data, error } = await supabase
    .from("drafts")
    .insert({ workspace_id: workspaceId, ...input })
    .select("*")
    .single<Draft>();
  if (error) throw new Error(`Failed to save draft: ${error.message}`);
  return data;
}

export async function getDraft(
  supabase: SupabaseClient,
  workspaceId: string,
  draftId: string,
): Promise<Draft> {
  const { data, error } = await supabase
    .from("drafts")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", draftId)
    .is("deleted_at", null)
    .maybeSingle<Draft>();
  if (error) throw new Error(`Failed to load draft: ${error.message}`);
  if (!data) throw notFound("Draft not found");
  return data;
}

export async function updateDraft(
  supabase: SupabaseClient,
  workspaceId: string,
  draftId: string,
  input: { content: string; status: Draft["status"] },
): Promise<Draft> {
  const { data, error } = await supabase
    .from("drafts")
    .update(input)
    .eq("workspace_id", workspaceId)
    .eq("id", draftId)
    .select("*")
    .single<Draft>();
  if (error) throw new Error(`Failed to update draft: ${error.message}`);
  return data;
}
