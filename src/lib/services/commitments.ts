import "server-only";

import { z } from "zod";

import type { RequestContext } from "@/lib/auth/context";
import { DEFAULT_BUDGETS } from "@/lib/ai/budget";
import { extractCommitments } from "@/lib/ai/workflows/extract-commitments";
import { createSupabaseServerClient, type SupabaseServerContext } from "@/lib/supabase/server";

import { withAi } from "./ai-runtime";
import { getConversation, ownerOf, StudioError } from "./studio";

const db = (context: SupabaseServerContext) => createSupabaseServerClient(context);

// ---------------------------------------------------------------- views
const taskRow = z.object({
  id: z.uuid(),
  title: z.string(),
  status: z.enum(["proposed", "open", "done", "dismissed", "rejected"]),
  priority: z.enum(["low", "normal", "high"]),
  due_date: z.string().nullable(),
  due_text_raw: z.string().nullable(),
  origin: z.enum(["user_stated", "extracted", "inferred"]),
  conversation_id: z.uuid().nullable(),
  commitment_id: z.uuid().nullable(),
  completed_at: z.string().nullable(),
  created_at: z.string(),
  contacts: z.object({ full_name: z.string() }).nullable(),
  conversations: z.object({ subject: z.string() }).nullable(),
  commitments: z.object({ description: z.string(), status: z.string(), evidence_state: z.string() }).nullable(),
});

export interface TaskView {
  id: string;
  title: string;
  status: "proposed" | "open" | "done" | "dismissed" | "rejected";
  priority: "low" | "normal" | "high";
  dueDate: string | null;
  dueText: string | null;
  fromAi: boolean;
  conversationId: string | null;
  conversationSubject: string | null;
  contactName: string | null;
  commitment: { id: string; description: string; status: string } | null;
  /** An AI-origin task whose commitment was rejected or lost its sources (DATABASE.md §5.6). */
  needsReview: boolean;
  completedAt: string | null;
}

const TASK_SELECT =
  "id, title, status, priority, due_date, due_text_raw, origin, conversation_id, commitment_id, completed_at, created_at, contacts(full_name), conversations(subject), commitments(description, status, evidence_state)";

function toTask(r: z.infer<typeof taskRow>): TaskView {
  const fromAi = r.origin !== "user_stated";
  return {
    id: r.id,
    title: r.title,
    status: r.status,
    priority: r.priority,
    dueDate: r.due_date,
    dueText: r.due_text_raw,
    fromAi,
    conversationId: r.conversation_id,
    conversationSubject: r.conversations?.subject ?? null,
    contactName: r.contacts?.full_name ?? null,
    commitment: r.commitment_id && r.commitments ? { id: r.commitment_id, description: r.commitments.description, status: r.commitments.status } : null,
    needsReview: fromAi && (r.status === "open" || r.status === "proposed") && (!r.commitments || r.commitments.status === "rejected" || r.commitments.evidence_state !== "supported"),
    completedAt: r.completed_at,
  };
}

export async function listTasks(ctx: RequestContext): Promise<TaskView[]> {
  const supabase = await db("server-component");
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("workspace_id", ctx.workspaceId)
    .in("status", ["proposed", "open", "done", "dismissed"])
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw new StudioError("failed");
  return z.array(taskRow).parse(data).map(toTask);
}

const commitmentRow = z.object({
  id: z.uuid(),
  description: z.string(),
  owner: z.enum(["me", "them"]),
  due_date: z.string().nullable(),
  due_text_raw: z.string().nullable(),
  status: z.enum(["proposed", "confirmed", "rejected", "superseded"]),
  origin: z.enum(["user_stated", "extracted", "inferred"]),
  evidence_state: z.enum(["supported", "sources_hidden", "sources_deleted"]),
  confidence: z.enum(["low", "medium", "high"]).nullable(),
  created_at: z.string(),
  citations: z.array(z.object({ quote: z.string().nullable(), messages: z.object({ position: z.number() }).nullable() })),
  tasks: z.array(z.object({ id: z.uuid(), title: z.string(), status: z.string() })),
});

export interface CommitmentView {
  id: string;
  description: string;
  owner: "me" | "them";
  dueDate: string | null;
  dueText: string | null;
  status: "proposed" | "confirmed" | "rejected" | "superseded";
  origin: "user_stated" | "extracted" | "inferred";
  supported: boolean;
  confidence: "low" | "medium" | "high" | null;
  citations: { position: number; quote: string | null }[];
  task: { id: string; title: string; status: string } | null;
}

export async function listCommitments(ctx: RequestContext, conversationId: string): Promise<CommitmentView[]> {
  const supabase = await db("server-component");
  const { data, error } = await supabase
    .from("commitments")
    .select("id, description, owner, due_date, due_text_raw, status, origin, evidence_state, confidence, created_at, citations(quote, messages(position)), tasks(id, title, status)")
    .eq("workspace_id", ctx.workspaceId)
    .eq("conversation_id", conversationId)
    .neq("status", "superseded")
    .order("created_at");
  if (error) throw new StudioError("failed");
  return z
    .array(commitmentRow)
    .parse(data)
    .map((r) => ({
      id: r.id,
      description: r.description,
      owner: r.owner,
      dueDate: r.due_date,
      dueText: r.due_text_raw,
      status: r.status,
      origin: r.origin,
      supported: r.evidence_state === "supported",
      confidence: r.confidence,
      citations: r.citations.flatMap((c) => (c.messages ? [{ position: c.messages.position, quote: c.quote }] : [])).sort((a, b) => a.position - b.position),
      task: r.tasks[0] ?? null,
    }));
}

// ---------------------------------------------------------------- AI proposals
export interface ExtractSummary {
  created: number;
  tasks: number;
  duplicates: number;
  unsupported: number;
}
const storeResult = z.object({
  status: z.enum(["ok", "invalid", "not_found"]),
  created: z.number().optional(),
  tasks: z.number().optional(),
  duplicates: z.number().optional(),
  unsupported: z.number().optional(),
});

/** Finds commitments with the AI and stores them as proposals. Nothing is confirmed here. */
export async function extractConversationCommitments(ctx: RequestContext, conversationId: string): Promise<ExtractSummary> {
  const detail = await getConversation(ctx, conversationId, "server-action");
  const result = await withAi(ctx, DEFAULT_BUDGETS.extractCommitments, (provider, budget) =>
    extractCommitments(provider, { subject: detail.conversation.subject, messages: detail.messages, owner: ownerOf(ctx, detail) }, budget),
  );
  if (result.proposals.length === 0) return { created: 0, tasks: 0, duplicates: 0, unsupported: result.droppedUnsupported };
  const supabase = await db("server-action");
  const { data, error } = await supabase.rpc("store_commitment_proposals", {
    p_workspace_id: ctx.workspaceId,
    p_conversation_id: conversationId,
    p_items: result.proposals,
    p_meta: { provider: result.metadata.provider, model: result.metadata.model, prompt_version: `${result.metadata.promptId}@${result.metadata.promptVersion}` },
  });
  if (error) throw new StudioError("failed");
  const stored = storeResult.parse(data);
  if (stored.status === "not_found") throw new StudioError("not_found");
  if (stored.status !== "ok") throw new StudioError("failed");
  return { created: stored.created ?? 0, tasks: stored.tasks ?? 0, duplicates: stored.duplicates ?? 0, unsupported: (stored.unsupported ?? 0) + result.droppedUnsupported };
}

// ---------------------------------------------------------------- the user's own tasks
const simpleStatus = z.object({ status: z.string() });

export async function createTask(ctx: RequestContext, input: { title: string; dueDate: string | null; priority: "low" | "normal" | "high" }): Promise<"created" | "invalid"> {
  const supabase = await db("server-action");
  const { data, error } = await supabase.rpc("create_task", { p_workspace_id: ctx.workspaceId, p_title: input.title, p_due_date: input.dueDate, p_priority: input.priority });
  if (error) throw new StudioError("failed");
  const { status } = simpleStatus.parse(data);
  if (status === "not_found") throw new StudioError("not_found");
  return status === "created" ? "created" : "invalid";
}

export async function setTaskStatus(_ctx: RequestContext, taskId: string, status: "open" | "done" | "dismissed"): Promise<"ok" | "not_found" | "invalid_transition"> {
  const supabase = await db("server-action");
  const { data, error } = await supabase.rpc("set_task_status", { p_task_id: taskId, p_status: status });
  if (error) throw new StudioError("failed");
  const r = simpleStatus.parse(data).status;
  return r === "ok" || r === "not_found" ? r : "invalid_transition";
}

/** A valid IANA time zone name (or UTC). */
export function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return /^[A-Za-z0-9_+/-]{1,64}$/.test(tz);
  } catch {
    return false;
  }
}

/** Today and the date a week ahead as calendar dates (YYYY-MM-DD) in the user's time zone. */
export function localDays(timeZone: string, now: Date = new Date()): { today: string; inAWeek: string } {
  const tz = isTimeZone(timeZone) ? timeZone : "UTC";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const inAWeek = new Date(Date.parse(`${today}T00:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);
  return { today, inAWeek };
}

/** The workspace's time zone (Settings), UTC by default. */
export async function getTimeZone(ctx: RequestContext): Promise<string> {
  const supabase = await db("server-component");
  const { data, error } = await supabase.from("workspace_settings").select("time_zone").eq("workspace_id", ctx.workspaceId).single();
  if (error) throw new StudioError("failed");
  const tz = z.object({ time_zone: z.string() }).parse(data).time_zone;
  return isTimeZone(tz) ? tz : "UTC";
}
