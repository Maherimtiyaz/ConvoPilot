import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";

import { safeToolName, type AuditSink } from "./audit";

/** Records `ai.policy_denied` through public.log_event (actor and workspace set by the database). */
export function createSupabaseAuditSink(): AuditSink {
  return {
    async policyDenied(toolName, reason) {
      const supabase = await createSupabaseServerClient("server-action");
      const { error } = await supabase.rpc("log_event", {
        p_action: "ai.policy_denied",
        p_target_type: "tool",
        p_target_id: safeToolName(toolName),
        p_metadata: { reason_code: reason },
      });
      if (error) throw new Error("Audit write failed");
    },
  };
}
