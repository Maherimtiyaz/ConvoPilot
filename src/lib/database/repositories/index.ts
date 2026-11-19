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

// ---------------------------------------------------------------------------
// Conversation listing
// ---------------------------------------------------------------------------

export interface ConversationListItem {
  id: string;
  subject: string | null;
  source_type: string;
  last_message_at: string | null;
  created_at: string;
  contact_name: string | null;
  message_count: number;
}

export async function listConversations(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<ConversationListItem[]> {
  const { data, error } = await supabase
    .from("conversations")
    .select(
      `id, subject, source_type, last_message_at, created_at,
       contacts ( full_name ),
       messages ( count )`,
    )
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to list conversations: ${error.message}`);

  return (data ?? []).map((row) => {
    const r = row as unknown as {
      id: string;
      subject: string | null;
      source_type: string;
      last_message_at: string | null;
      created_at: string;
      contacts: { full_name: string }[] | null;
      messages: { count: number }[];
    };
    return {
      id: r.id,
      subject: r.subject,
      source_type: r.source_type,
      last_message_at: r.last_message_at,
      created_at: r.created_at,
      contact_name: r.contacts?.[0]?.full_name ?? null,
      message_count: r.messages?.[0]?.count ?? 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Commitments
// ---------------------------------------------------------------------------

export interface CommitmentRecord {
  id: string;
  workspace_id: string;
  contact_id: string | null;
  conversation_id: string | null;
  description: string;
  owner: "me" | "them";
  due_date: string | null;
  status: "proposed" | "active" | "completed" | "dismissed";
  confidence: number | null;
  is_confirmed: boolean;
  source_message_id: string | null;
  source_excerpt: string | null;
  created_at: string;
  updated_at: string;
}

export async function createCommitmentProposal(
  supabase: SupabaseClient,
  workspaceId: string,
  input: {
    conversation_id: string;
    contact_id: string | null;
    owner: "me" | "them";
    description: string;
    due_date: string | null;
    confidence: number;
    source_message_id: string | null;
    source_excerpt: string;
    model_metadata: Record<string, unknown>;
  },
): Promise<CommitmentRecord> {
  const { data, error } = await supabase
    .from("commitments")
    .insert({ workspace_id: workspaceId, status: "proposed", is_confirmed: false, ...input })
    .select("*")
    .single<CommitmentRecord>();
  if (error) throw new Error(`Failed to save commitment proposal: ${error.message}`);
  return data;
}

export async function listCommitments(
  supabase: SupabaseClient,
  workspaceId: string,
  statuses: CommitmentRecord["status"][],
): Promise<CommitmentRecord[]> {
  const { data, error } = await supabase
    .from("commitments")
    .select("*")
    .eq("workspace_id", workspaceId)
    .in("status", statuses)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to list commitments: ${error.message}`);
  return (data ?? []) as CommitmentRecord[];
}

export async function updateCommitmentStatus(
  supabase: SupabaseClient,
  workspaceId: string,
  commitmentId: string,
  status: CommitmentRecord["status"],
  isConfirmed: boolean,
): Promise<CommitmentRecord> {
  const { data, error } = await supabase
    .from("commitments")
    .update({ status, is_confirmed: isConfirmed })
    .eq("workspace_id", workspaceId)
    .eq("id", commitmentId)
    .select("*")
    .single<CommitmentRecord>();
  if (error) throw new Error(`Failed to update commitment: ${error.message}`);
  return data;
}

export async function getCommitment(
  supabase: SupabaseClient,
  workspaceId: string,
  commitmentId: string,
): Promise<CommitmentRecord> {
  const { data, error } = await supabase
    .from("commitments")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", commitmentId)
    .maybeSingle<CommitmentRecord>();
  if (error) throw new Error(`Failed to load commitment: ${error.message}`);
  if (!data) throw notFound("Commitment not found");
  return data;
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export interface TaskRecord {
  id: string;
  workspace_id: string;
  title: string;
  status: "todo" | "in_progress" | "done" | "cancelled";
  priority: "low" | "medium" | "high";
  due_date: string | null;
  contact_id: string | null;
  conversation_id: string | null;
  commitment_id: string | null;
  origin: "manual" | "proposed";
  created_at: string;
  updated_at: string;
}

export async function listTasks(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<TaskRecord[]> {
  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("workspace_id", workspaceId)
    .is("deleted_at", null)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Failed to list tasks: ${error.message}`);
  return (data ?? []) as TaskRecord[];
}

export async function createTask(
  supabase: SupabaseClient,
  workspaceId: string,
  input: {
    title: string;
    priority: TaskRecord["priority"];
    due_date: string | null;
    contact_id: string | null;
    conversation_id: string | null;
    commitment_id: string | null;
    origin: TaskRecord["origin"];
  },
): Promise<TaskRecord> {
  const { data, error } = await supabase
    .from("tasks")
    .insert({ workspace_id: workspaceId, ...input })
    .select("*")
    .single<TaskRecord>();
  if (error) throw new Error(`Failed to create task: ${error.message}`);
  return data;
}

export async function updateTask(
  supabase: SupabaseClient,
  workspaceId: string,
  taskId: string,
  input: Partial<Pick<TaskRecord, "title" | "status" | "priority" | "due_date">>,
): Promise<TaskRecord> {
  const { data, error } = await supabase
    .from("tasks")
    .update(input)
    .eq("workspace_id", workspaceId)
    .eq("id", taskId)
    .select("*")
    .single<TaskRecord>();
  if (error) throw new Error(`Failed to update task: ${error.message}`);
  return data;
}

// ---------------------------------------------------------------------------
// Audit logging
// ---------------------------------------------------------------------------

export async function logAudit(
  supabase: SupabaseClient,
  workspaceId: string,
  input: {
    actor: string;
    action: string;
    target_type: string;
    target_id: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabase.from("audit_logs").insert({
    workspace_id: workspaceId,
    actor: input.actor,
    action: input.action,
    target_type: input.target_type,
    target_id: input.target_id,
    metadata: input.metadata ?? {},
  });
  if (error) {
    // Audit failures must be visible, never silent.
    console.error(`[audit_log] failed to record ${input.action}: ${error.message}`);
  }
}
