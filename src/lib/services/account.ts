import "server-only";

import type { RequestContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { signOut } from "./auth";
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
  ["workspace_settings", "writing_style_profile, ai_hosted_processing_opt_in"],
  ["ai_usage_daily", "day, requests, input_tokens, output_tokens, cost_micro_usd"],
] as const;

/** Everything the user can see in their workspace, as plain JSON (deleted items are excluded). */
export async function exportWorkspaceData(ctx: RequestContext): Promise<Record<string, unknown>> {
  const supabase = await createSupabaseServerClient("server-action");
  const out: Record<string, unknown> = {
    format: "convopilot-export@1",
    exported_at: new Date().toISOString(),
    account_email: ctx.email,
  };
  for (const [table, columns] of EXPORT_TABLES) {
    const { data, error } = await supabase.from(table).select(columns).eq("workspace_id", ctx.workspaceId).limit(50_000);
    if (error) throw new StudioError("failed");
    out[table] = data;
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
