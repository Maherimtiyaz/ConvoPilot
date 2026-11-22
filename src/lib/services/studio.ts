import "server-only";

import { z } from "zod";

import type { RequestContext } from "@/lib/auth/context";
import { DEFAULT_BUDGETS } from "@/lib/ai/budget";
import { analyzeThread, storedAnalysisSchema, type StoredAnalysis } from "@/lib/ai/workflows/analyze-thread";
import { draftReply, type DraftOptions, type WritingStyle } from "@/lib/ai/workflows/draft-reply";
import { resolveDirections, type ThreadMessage, type ThreadOwner } from "@/lib/ai/workflows/thread-input";
import { parseFile, parsePastedText, type ParseError, type ParsedThread } from "@/lib/conversations/parse";
import { wallTimeToUtc } from "@/lib/conversations/whatsapp";
import { getAiEnv } from "@/lib/env/ai";
import { createSupabaseServerClient, type SupabaseServerContext } from "@/lib/supabase/server";
import { writingStyleSchema } from "@/lib/validation/studio";

import { withAi } from "./ai-runtime";

export class StudioError extends Error {
  constructor(readonly code: "not_found" | "failed") {
    super(`Studio ${code}`);
    this.name = "StudioError";
  }
}

const db = (context: SupabaseServerContext) => createSupabaseServerClient(context);

// ---------------------------------------------------------------- reads
const conversationRow = z.object({
  id: z.uuid(),
  subject: z.string(),
  source_type: z.enum(["paste", "file"]),
  message_count: z.number(),
  last_message_at: z.string().nullable(),
  created_at: z.string(),
});
export type ConversationSummary = z.infer<typeof conversationRow>;

const messageRow = z.object({
  id: z.uuid(),
  workspace_id: z.uuid(),
  position: z.number(),
  direction: z.enum(["inbound", "outbound", "unknown"]),
  sender_name: z.string().nullable(),
  sender_email: z.string().nullable(),
  sent_at: z.string().nullable(),
  body_text: z.string(),
});

const draftRow = z.object({
  id: z.uuid(),
  content: z.string(),
  tone: z.enum(["warm", "neutral", "formal"]),
  length: z.enum(["short", "medium", "long"]),
  edited_by_user: z.boolean(),
  ai_model: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type DraftView = z.infer<typeof draftRow>;

const analysisRow = z.object({ id: z.uuid(), analysis: z.unknown(), ai_model: z.string(), prompt_version: z.string(), created_at: z.string() });

export async function listConversations(ctx: RequestContext): Promise<ConversationSummary[]> {
  const supabase = await db("server-component");
  const { data, error } = await supabase
    .from("conversations")
    .select("id, subject, source_type, message_count, last_message_at, created_at")
    .eq("workspace_id", ctx.workspaceId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new StudioError("failed");
  return z.array(conversationRow).parse(data);
}

export interface ConversationDetail {
  conversation: ConversationSummary;
  messages: ThreadMessage[];
  analysis: { id: string; data: StoredAnalysis; model: string; promptVersion: string; createdAt: string } | null;
  drafts: DraftView[];
  /** The user's names in chat exports (Settings), used to tell their own messages apart. */
  chatNames: string[];
}

/** A stored analysis that no longer matches its schema is treated as absent (never cast blindly). */
function storedAnalysis(row: z.infer<typeof analysisRow> | null): ConversationDetail["analysis"] {
  if (!row) return null;
  const parsed = storedAnalysisSchema.safeParse(row.analysis);
  return parsed.success ? { id: row.id, data: parsed.data, model: row.ai_model, promptVersion: row.prompt_version, createdAt: row.created_at } : null;
}

export async function getConversation(ctx: RequestContext, id: string, context: SupabaseServerContext = "server-component"): Promise<ConversationDetail> {
  const supabase = await db(context);
  const [c, m, a, d, s] = await Promise.all([
    supabase.from("conversations").select("id, subject, source_type, message_count, last_message_at, created_at").eq("id", id).eq("workspace_id", ctx.workspaceId).maybeSingle(),
    supabase.from("messages").select("id, workspace_id, position, direction, sender_name, sender_email, sent_at, body_text").eq("conversation_id", id).eq("workspace_id", ctx.workspaceId).order("position"),
    supabase.from("thread_analyses").select("id, analysis, ai_model, prompt_version, created_at").eq("conversation_id", id).eq("workspace_id", ctx.workspaceId).order("created_at", { ascending: false }).limit(1),
    supabase.from("drafts").select("id, content, tone, length, edited_by_user, ai_model, created_at, updated_at").eq("conversation_id", id).eq("workspace_id", ctx.workspaceId).order("created_at", { ascending: false }).limit(20),
    supabase.from("workspace_settings").select("chat_names").eq("workspace_id", ctx.workspaceId).single(),
  ]);
  if (c.error || m.error || a.error || d.error || s.error) throw new StudioError("failed");
  const chatNames = z.object({ chat_names: z.array(z.string()) }).parse(s.data).chat_names;
  if (!c.data) throw new StudioError("not_found");
  const analysis = a.data?.[0] ? analysisRow.parse(a.data[0]) : null;
  return {
    conversation: conversationRow.parse(c.data),
    messages: resolveDirections(z.array(messageRow).parse(m.data).map((r) => ({
      id: r.id,
      workspaceId: r.workspace_id,
      position: r.position,
      direction: r.direction,
      senderName: r.sender_name,
      senderEmail: r.sender_email,
      sentAt: r.sent_at,
      body: r.body_text,
    })), chatNames),
    analysis: storedAnalysis(analysis),
    drafts: z.array(draftRow).parse(d.data),
    chatNames,
  };
}

const settingsRow = z.object({ ai_hosted_processing_opt_in: z.boolean(), writing_style_profile: z.record(z.string(), z.unknown()) });

export interface AiSettings {
  optIn: boolean;
  style: WritingStyle;
  spentTodayUsd: number;
  capUsd: number;
  configured: boolean;
}

export async function getAiSettings(ctx: RequestContext, context: SupabaseServerContext = "server-component"): Promise<AiSettings> {
  const supabase = await db(context);
  const today = new Date().toISOString().slice(0, 10);
  const [s, u] = await Promise.all([
    supabase.from("workspace_settings").select("ai_hosted_processing_opt_in, writing_style_profile").eq("workspace_id", ctx.workspaceId).single(),
    supabase.from("ai_usage_daily").select("cost_micro_usd").eq("workspace_id", ctx.workspaceId).eq("day", today).maybeSingle(),
  ]);
  if (s.error || u.error) throw new StudioError("failed");
  const settings = settingsRow.parse(s.data);
  const style = writingStyleSchema.safeParse(settings.writing_style_profile.style ?? {});
  const env = getAiEnv();
  return {
    optIn: settings.ai_hosted_processing_opt_in,
    style: style.success ? style.data : {},
    spentTodayUsd: Number(u.data?.cost_micro_usd ?? 0) / 1_000_000,
    capUsd: env.AI_DAILY_COST_CAP_USD,
    configured: Boolean(env.ANTHROPIC_API_KEY),
  };
}

// ---------------------------------------------------------------- import and delete
export type ImportResult =
  | { status: "created" | "duplicate"; conversationId: string; omittedOlder: number }
  | { status: "parse_error"; error: ParseError }
  | { status: "invalid" };

/** The workspace time zone from Settings; UTC if unset or invalid. */
async function workspaceTimeZone(ctx: RequestContext): Promise<string> {
  const supabase = await db("server-action");
  const { data, error } = await supabase.from("workspace_settings").select("time_zone").eq("workspace_id", ctx.workspaceId).single();
  if (error) throw new StudioError("failed");
  const tz = z.object({ time_zone: z.string() }).parse(data).time_zone;
  return /^[A-Za-z0-9_+/-]{1,64}$/.test(tz) ? tz : "UTC";
}

export async function importConversation(
  ctx: RequestContext,
  input: { kind: "paste"; text: string; subject?: string } | { kind: "file"; name: string; bytes: Uint8Array; subject?: string },
): Promise<ImportResult> {
  const parsed = input.kind === "paste" ? parsePastedText(input.text) : parseFile(input.name, input.bytes);
  if (!parsed.ok) return { status: "parse_error", error: parsed.error };
  const thread: ParsedThread = parsed.thread;
  // WhatsApp times are the phone's local time: read them in the workspace time zone (Settings).
  const timeZone = thread.localTimes ? await workspaceTimeZone(ctx) : null;
  const sentAt = (value: string | null) => (value && timeZone ? wallTimeToUtc(value, timeZone) : value);
  const me = ctx.email?.toLowerCase() ?? null;
  const subject =
    input.subject?.trim() ||
    thread.subject ||
    thread.messages[0].body.split("\n").find((l) => l.trim())?.trim().slice(0, 80) ||
    "Untitled conversation";
  const supabase = await db("server-action");
  const { data, error } = await supabase.rpc("import_conversation", {
    p_workspace_id: ctx.workspaceId,
    p_subject: subject.slice(0, 300),
    p_source_type: input.kind,
    p_source_file_name: input.kind === "file" ? input.name.slice(0, 255) : null,
    p_messages: thread.messages.map((m) => ({
      sender_name: m.senderName,
      sender_email: m.senderEmail,
      sent_at: sentAt(m.sentAt),
      body: m.body,
      direction: m.senderEmail ? (m.senderEmail === me ? "outbound" : "inbound") : "unknown",
    })),
  });
  if (error) throw new StudioError("failed");
  const result = z.object({ status: z.enum(["created", "duplicate", "invalid"]), conversation_id: z.uuid().optional() }).parse(data);
  if (result.status === "invalid" || !result.conversation_id) return { status: "invalid" };
  return { status: result.status, conversationId: result.conversation_id, omittedOlder: thread.omittedOlder ?? 0 };
}

export async function deleteConversation(id: string): Promise<boolean> {
  const supabase = await db("server-action");
  const { data, error } = await supabase.rpc("soft_delete_conversation", { p_conversation_id: id });
  if (error) throw new StudioError("failed");
  return (data as { status?: string } | null)?.status === "deleted";
}

// ---------------------------------------------------------------- AI runs
export const ownerOf = (ctx: RequestContext, detail: Pick<ConversationDetail, "chatNames">): ThreadOwner => ({ name: null, email: ctx.email, chatNames: detail.chatNames });

export async function analyzeConversation(ctx: RequestContext, conversationId: string): Promise<void> {
  const detail = await getConversation(ctx, conversationId, "server-action");
  const result = await withAi(ctx, DEFAULT_BUDGETS.analyzeThread, (provider, budget) =>
    analyzeThread(provider, { subject: detail.conversation.subject, messages: detail.messages, owner: ownerOf(ctx, detail) }, budget),
  );
  const supabase = await db("server-action");
  const { data, error } = await supabase
    .from("thread_analyses")
    .insert({
      workspace_id: ctx.workspaceId,
      conversation_id: conversationId,
      analysis: result.analysis,
      ai_provider: result.metadata.provider,
      ai_model: result.metadata.model,
      prompt_version: `${result.metadata.promptId}@${result.metadata.promptVersion}`,
      input_tokens: result.metadata.usage.inputTokens,
      output_tokens: result.metadata.usage.outputTokens,
    })
    .select("id")
    .single();
  if (error || !data) throw new StudioError("failed");
  const points = [result.analysis.intent, ...result.analysis.mainPoints, result.analysis.expectedResponse, ...result.analysis.risks].filter((p) => p !== null);
  const unique = new Map<string, { message_id: string; quote: string | null }>();
  for (const p of points) for (const c of p.citations) unique.set(`${c.messageId}|${c.quote ?? ""}`, { message_id: c.messageId, quote: c.quote ? c.quote.slice(0, 1000) : null });
  if (unique.size > 0) {
    const { error: citeError } = await supabase
      .from("citations")
      .insert([...unique.values()].map((c) => ({ workspace_id: ctx.workspaceId, thread_analysis_id: data.id, ...c })));
    if (citeError) throw new StudioError("failed");
  }
}

export async function createDraft(ctx: RequestContext, conversationId: string, options: DraftOptions): Promise<string> {
  const [detail, settings] = await Promise.all([getConversation(ctx, conversationId, "server-action"), getAiSettings(ctx, "server-action")]);
  const result = await withAi(ctx, DEFAULT_BUDGETS.draftReply, (provider, budget) =>
    draftReply(provider, { subject: detail.conversation.subject, messages: detail.messages, owner: ownerOf(ctx, detail), style: settings.style, options }, budget),
  );
  const supabase = await db("server-action");
  const { data, error } = await supabase
    .from("drafts")
    .insert({
      workspace_id: ctx.workspaceId,
      conversation_id: conversationId,
      content: result.content.slice(0, 20000),
      tone: options.tone,
      length: options.length,
      ai_provider: result.metadata.provider,
      ai_model: result.metadata.model,
      prompt_version: `${result.metadata.promptId}@${result.metadata.promptVersion}`,
      input_tokens: result.metadata.usage.inputTokens,
      output_tokens: result.metadata.usage.outputTokens,
    })
    .select("id")
    .single();
  if (error || !data) throw new StudioError("failed");
  if (result.citedMessageIds.length > 0) {
    const { error: citeError } = await supabase
      .from("citations")
      .insert(result.citedMessageIds.map((m) => ({ workspace_id: ctx.workspaceId, draft_id: data.id, message_id: m })));
    if (citeError) throw new StudioError("failed");
  }
  return data.id;
}

export async function updateDraft(ctx: RequestContext, draftId: string, content: string): Promise<void> {
  const supabase = await db("server-action");
  const { data, error } = await supabase.from("drafts").update({ content, edited_by_user: true }).eq("id", draftId).eq("workspace_id", ctx.workspaceId).select("id");
  if (error) throw new StudioError("failed");
  if (!data?.length) throw new StudioError("not_found");
}

export async function deleteDraft(draftId: string): Promise<void> {
  const supabase = await db("server-action");
  const { error } = await supabase.rpc("soft_delete_draft", { p_draft_id: draftId });
  if (error) throw new StudioError("failed");
}

// ---------------------------------------------------------------- settings
export async function updateAiSettings(ctx: RequestContext, update: { optIn?: boolean; style?: WritingStyle }): Promise<void> {
  const supabase = await db("server-action");
  const patch: Record<string, unknown> = {};
  if (update.optIn !== undefined) patch.ai_hosted_processing_opt_in = update.optIn;
  if (update.style !== undefined) {
    patch.writing_style_profile = { style: update.style, origin: "user_stated", status: "confirmed", updated_at: new Date().toISOString() };
  }
  const { data, error } = await supabase.from("workspace_settings").update(patch).eq("workspace_id", ctx.workspaceId).select("workspace_id");
  if (error || !data?.length) throw new StudioError("failed");
}
