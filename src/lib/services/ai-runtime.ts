import "server-only";

import { z } from "zod";

import type { RequestContext } from "@/lib/auth/context";
import { type AiWorkflow, DEFAULT_BUDGETS, TokenBudget, WORST_CASE_OUTPUT_TOKENS } from "@/lib/ai/budget";
import { AiError } from "@/lib/ai/errors";
import { AI_ACTION_DEADLINE_MS } from "@/lib/ai/limits";
import { costMicroUsd } from "@/lib/ai/pricing";
import type { AiProvider } from "@/lib/ai/provider";
import { createAnthropicProvider } from "@/lib/ai/providers/anthropic";
import type { ModelMetadata } from "@/lib/ai/types";
import { getAiEnv } from "@/lib/env/ai";
import { log } from "@/lib/observability/log";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { getAiSettings, StudioError } from "./studio";

/**
 * Shared guard rails for every AI run (docs/AGENT_DESIGN.md §9): provider configured, the user's
 * consent to hosted processing, the per-workspace daily cost cap, a per-request token budget, and
 * usage recording (also for failed runs).
 */
function providerFromEnv(): AiProvider {
  const env = getAiEnv();
  if (!env.ANTHROPIC_API_KEY) throw new AiError("not_configured");
  return createAnthropicProvider({ apiKey: env.ANTHROPIC_API_KEY, model: env.AI_MODEL, baseURL: env.ANTHROPIC_BASE_URL });
}

async function ensureAiAllowed(ctx: RequestContext): Promise<{ capUsd: number }> {
  const settings = await getAiSettings(ctx, "server-action");
  if (!settings.configured) throw new AiError("not_configured");
  if (!settings.optIn) throw new AiError("consent_required");
  if (settings.spentTodayUsd >= settings.capUsd) throw new AiError("daily_limit");
  return { capUsd: settings.capUsd };
}

/**
 * Reserves the run's worst case (its whole token budget priced as output) under a database row
 * lock, so concurrent requests cannot all slip under the daily cap (security review M1).
 */
async function reserve(ctx: RequestContext, amountMicroUsd: number, capUsd: number): Promise<string> {
  const supabase = await createSupabaseServerClient("server-action");
  const { data, error } = await supabase.rpc("reserve_ai_usage", {
    p_workspace_id: ctx.workspaceId,
    p_amount_micro_usd: amountMicroUsd,
    p_cap_micro_usd: Math.round(capUsd * 1_000_000),
  });
  if (error) throw new StudioError("failed");
  const result = z.object({ status: z.string(), reservation_id: z.uuid().optional() }).parse(data);
  if (result.status === "over_cap") throw new AiError("daily_limit");
  if (result.status !== "ok" || !result.reservation_id) throw new StudioError("failed");
  return result.reservation_id;
}

async function recordUsage(ctx: RequestContext, model: string, inputTokens: number, outputTokens: number, reservationId: string): Promise<void> {
  const supabase = await createSupabaseServerClient("server-action");
  const { error } = await supabase.rpc("record_ai_usage", {
    p_workspace_id: ctx.workspaceId,
    p_input_tokens: inputTokens,
    p_output_tokens: outputTokens,
    p_cost_micro_usd: costMicroUsd(model, inputTokens, outputTokens),
    p_reservation_id: reservationId,
  });
  if (error) throw new StudioError("failed");
}

/**
 * Runs a workflow under the consent check, daily cap, per-request budget and an overall deadline
 * (below the page's maxDuration, so the reservation is always settled), always recording spend.
 */
export async function withAi<T extends { metadata: ModelMetadata }>(ctx: RequestContext, workflow: AiWorkflow, run: (provider: AiProvider, budget: TokenBudget) => Promise<T>): Promise<T> {
  const { capUsd } = await ensureAiAllowed(ctx);
  const provider = providerFromEnv();
  const budgetTokens = DEFAULT_BUDGETS[workflow];
  const outputTokens = WORST_CASE_OUTPUT_TOKENS[workflow];
  const reserved = Math.min(100_000_000, costMicroUsd(getAiEnv().AI_MODEL, budgetTokens - outputTokens, outputTokens));
  const reservationId = await reserve(ctx, reserved, capUsd);
  const budget = new TokenBudget(budgetTokens);
  const started = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AiError("timeout")), AI_ACTION_DEADLINE_MS);
  });
  try {
    const result = await Promise.race([run(provider, budget), deadline]);
    await recordUsage(ctx, result.metadata.model, result.metadata.usage.inputTokens, result.metadata.usage.outputTokens, reservationId);
    log("info", { event: "ai.completed", workflow, durationMs: Date.now() - started, inputTokens: result.metadata.usage.inputTokens, outputTokens: result.metadata.usage.outputTokens });
    return result;
  } catch (error) {
    // Failed runs still cost money: record what was spent, priced conservatively as output tokens,
    // and always release the reservation.
    await recordUsage(ctx, getAiEnv().AI_MODEL, 0, budget.spent, reservationId).catch(() => undefined);
    log("warn", { event: "ai.failed", workflow, code: error instanceof AiError ? error.code : "unexpected", durationMs: Date.now() - started });
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
