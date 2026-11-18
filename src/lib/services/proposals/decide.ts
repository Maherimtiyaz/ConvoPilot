import "server-only";

import { z } from "zod";

import type { RequestContext } from "@/lib/auth/context";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { StudioError } from "../studio";

/**
 * The ONLY place that may call the decision functions (docs/DATABASE.md §5.3; CI guard
 * scripts/ci/ai-guards.sh). Called only from Server Actions the user triggers by pressing a
 * button; AI workflows and tools never import this module.
 */
export type DecisionStatus = "ok" | "not_found" | "invalid" | "invalid_transition" | "unsupported" | "commitment_not_confirmed";
const result = z.object({ status: z.enum(["ok", "not_found", "invalid", "invalid_transition", "unsupported", "commitment_not_confirmed"]) });

export async function decideProposal(_ctx: RequestContext, kind: "commitment" | "task", id: string, decision: "confirm" | "reject"): Promise<DecisionStatus> {
  const supabase = await createSupabaseServerClient("server-action");
  const { data, error } = await supabase.rpc("decide_proposal", { p_kind: kind, p_id: id, p_decision: decision });
  if (error) throw new StudioError("failed");
  return result.parse(data).status;
}

/** Opens a proposed task; with confirmCommitment, also confirms its proposed commitment, atomically. */
export async function approveTask(_ctx: RequestContext, taskId: string, confirmCommitment: boolean): Promise<DecisionStatus> {
  const supabase = await createSupabaseServerClient("server-action");
  const { data, error } = await supabase.rpc("approve_task", { p_task_id: taskId, p_confirm_commitment: confirmCommitment });
  if (error) throw new StudioError("failed");
  return result.parse(data).status;
}
