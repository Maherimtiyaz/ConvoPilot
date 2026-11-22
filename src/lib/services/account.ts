import "server-only";

import { z } from "zod";

import type { RequestContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { signOut } from "./auth";
import { isTimeZone } from "./commitments";
import { StudioError } from "./studio";

/**
 * Account-level data rights (docs/SECURITY.md §14, DATABASE.md §8.6–§8.7): a full export of the
 * user's workspace and the account-deletion request.
 */

const EXPORT_TABLES = [
  ["conversations", "id, subject, source_type, message_count, last_message_at, created_at"],
  ["messages", "id, conversation_id, position, direction, sender_name, sender_email, sent_at, body_text, source_file_name, created_at"],
  ["thread_analyses", "id, conversation_id, analysis, ai_provider, ai_model, prompt_version, created_at"],
  ["drafts", "id, conversation_id, content, tone, length, edited_by_user, ai_model, created_at, updated_at"],
  ["companies", "id, name, domain, created_at"],
  ["contacts", "id, full_name, company_id, role_title, relationship_context, last_interaction_at, created_at"],
  ["contact_identifiers", "contact_id, kind, value_normalized"],
  ["commitments", "id, conversation_id, contact_id, description, owner, due_date, due_text_raw, status, origin, evidence_state, confidence, decided_at, ai_model, prompt_version, created_at"],
  ["tasks", "id, title, status, priority, due_date, due_text_raw, origin, conversation_id, commitment_id, contact_id, completed_at, decided_at, created_at"],
  ["citations", "id, thread_analysis_id, draft_id, commitment_id, message_id, quote, created_at"],
  ["workspace_settings", "writing_style_profile, ai_hosted_processing_opt_in, time_zone, chat_names"],
  ["ai_usage_daily", "day, requests, input_tokens, output_tokens, cost_micro_usd"],
] as const;

const EXPORT_PAGE = 1000;
const MAX_EXPORT_PAGES = 500;
/** Stable sort keys for tables without an `id` column. */
const EXPORT_ORDER: Partial<Record<(typeof EXPORT_TABLES)[number][0], string>> = {
  contact_identifiers: "contact_id, kind, value_normalized",
  workspace_settings: "workspace_id",
  ai_usage_daily: "day",
};

/** Everything the user can see in their workspace, as plain JSON (deleted items are excluded). */
export async function exportWorkspaceData(ctx: RequestContext): Promise<Record<string, unknown>> {
  const supabase = await createSupabaseServerClient("server-action");
  const out: Record<string, unknown> = {
    format: "convopilot-export@1",
    exported_at: new Date().toISOString(),
    account_email: ctx.email,
  };
  // The API returns at most 1,000 rows per request (PostgREST max_rows), so read every table page
  // by page in a stable order; a short page means the table is complete (review 2026-11-22).
  for (const [table, columns] of EXPORT_TABLES) {
    const order = EXPORT_ORDER[table] ?? "id";
    const rows: unknown[] = [];
    for (let page = 0; ; page++) {
      if (page >= MAX_EXPORT_PAGES) throw new StudioError("failed");
      let query = supabase.from(table).select(columns).eq("workspace_id", ctx.workspaceId);
      for (const key of order.split(",")) query = query.order(key.trim());
      const { data, error } = await query.range(page * EXPORT_PAGE, page * EXPORT_PAGE + EXPORT_PAGE - 1);
      if (error) throw new StudioError("failed");
      rows.push(...(data ?? []));
      if (!data || data.length < EXPORT_PAGE) break;
    }
    out[table] = rows;
  }
  // Audited without content (DATABASE.md §10).
  const { error } = await supabase.rpc("log_event", { p_action: "export.requested", p_target_type: "export", p_target_id: null, p_metadata: {} });
  if (error) throw new StudioError("failed");
  return out;
}

/**
 * Requests account deletion: the workspace is soft-deleted at once (all data invisible to every
 * existing session), then every session of the user is revoked. Permanent deletion after the
 * retention period is done later by the privileged runner (pending owner decision on retention).
 */
export async function deleteAccount(): Promise<void> {
  const supabase = await createSupabaseServerClient("server-action");
  const { error } = await supabase.rpc("request_account_deletion");
  if (error) throw new StudioError("failed");
  await signOut("global").catch(() => signOut("local"));
}

// ---------------------------------------------------------------- recently deleted (30-day window)
const deletedItem = z.object({
  kind: z.enum(["conversation", "contact"]),
  id: z.uuid(),
  title: z.string(),
  deleted_at: z.string(),
  erase_at: z.string(),
});
export type DeletedItem = z.infer<typeof deletedItem>;

export async function listRecentlyDeleted(): Promise<DeletedItem[]> {
  const supabase = await createSupabaseServerClient("server-component");
  const { data, error } = await supabase.rpc("list_recently_deleted");
  if (error) throw new StudioError("failed");
  return z.object({ items: z.array(deletedItem) }).parse(data).items;
}

export type RestoreStatus = "restored" | "not_found" | "duplicate";

/** Restores the caller's own deleted conversation or contact (membership checked in the database). */
export async function restoreItem(kind: "conversation" | "contact", id: string): Promise<{ status: RestoreStatus; emailsSkipped: number }> {
  const supabase = await createSupabaseServerClient("server-action");
  const { data, error } =
    kind === "conversation" ? await supabase.rpc("restore_conversation", { p_conversation_id: id }) : await supabase.rpc("restore_contact", { p_contact_id: id });
  if (error) throw new StudioError("failed");
  const r = z.object({ status: z.enum(["restored", "not_found", "duplicate"]), emails_skipped: z.number().optional() }).parse(data);
  return { status: r.status, emailsSkipped: r.emails_skipped ?? 0 };
}

// ---------------------------------------------------------------- names in chat exports
/** Trims, drops empties and duplicates (ignoring case); null when a name is unusable or there are more than 5. */
export function normaliseChatNames(input: string[]): string[] | null {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const name = raw.replace(/\s+/g, " ").trim();
    if (!name) continue;
    if (name.length > 100 || /[\u0000-\u001f\u007f]/.test(name)) return null;
    if (seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    out.push(name);
  }
  return out.length <= 5 ? out : null;
}

export async function getChatNames(ctx: RequestContext): Promise<string[]> {
  const supabase = await createSupabaseServerClient("server-component");
  const { data, error } = await supabase.from("workspace_settings").select("chat_names").eq("workspace_id", ctx.workspaceId).single();
  if (error) throw new StudioError("failed");
  return z.object({ chat_names: z.array(z.string()) }).parse(data).chat_names;
}

export async function setChatNames(ctx: RequestContext, input: string[]): Promise<"saved" | "invalid"> {
  const names = normaliseChatNames(input);
  if (!names) return "invalid";
  const supabase = await createSupabaseServerClient("server-action");
  const { error } = await supabase.from("workspace_settings").update({ chat_names: names }).eq("workspace_id", ctx.workspaceId);
  if (error) throw new StudioError("failed");
  return "saved";
}

// ---------------------------------------------------------------- time zone
export async function setTimeZone(ctx: RequestContext, timeZone: string): Promise<"saved" | "invalid"> {
  if (!isTimeZone(timeZone)) return "invalid";
  const supabase = await createSupabaseServerClient("server-action");
  const { error } = await supabase.from("workspace_settings").update({ time_zone: timeZone }).eq("workspace_id", ctx.workspaceId);
  if (error) throw new StudioError("failed");
  return "saved";
}
