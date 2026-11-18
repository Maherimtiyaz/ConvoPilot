import "server-only";

import { z } from "zod";

import type { RequestContext } from "@/lib/auth/context";
import { TokenBudget } from "@/lib/ai/budget";
import { AiError } from "@/lib/ai/errors";
import { costMicroUsd } from "@/lib/ai/pricing";
import type { AiProvider } from "@/lib/ai/provider";
import { createAnthropicProvider } from "@/lib/ai/providers/anthropic";
import type { ModelMetadata } from "@/lib/ai/types";
import { getAiEnv } from "@/lib/env/ai";
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
async function reserve(ctx: RequestContext, amountMicroUsd: number, capUsd: number): Promise<void> {
  const supabase = await createSupabaseServerClient("server-action");
  const { data, error } = await supabase.rpc("reserve_ai_usage", {
    p_workspace_id: ctx.workspaceId,
    p_amount_micro_usd: amountMicroUsd,
    p_cap_micro_usd: Math.round(capUsd * 1_000_000),
  });
  if (error) throw new StudioError("failed");
  const status = z.object({ status: z.string() }).parse(data).status;
  if (status === "over_cap") throw new AiError("daily_limit");
  if (status !== "ok") throw new StudioError("failed");
}

async function recordUsage(ctx: RequestContext, model: string, inputTokens: number, outputTokens: number, releaseMicroUsd: number): Promise<void> {
  const supabase = await createSupabaseServerClient("server-action");
  const { error } = await supabase.rpc("record_ai_usage", {
    p_workspace_id: ctx.workspaceId,
    p_input_tokens: inputTokens,
    p_output_tokens: outputTokens,
    p_cost_micro_usd: costMicroUsd(model, inputTokens, outputTokens),
    p_release_micro_usd: releaseMicroUsd,
  });
  if (error) throw new StudioError("failed");
}

/** Runs a workflow under the consent check, daily cap and per-request budget, always recording spend. */
export async function withAi<T extends { metadata: ModelMetadata }>(ctx: RequestContext, budgetTokens: number, run: (provider: AiProvider, budget: TokenBudget) => Promise<T>): Promise<T> {
  const { capUsd } = await ensureAiAllowed(ctx);
  const provider = providerFromEnv();
  const reserved = Math.min(100_000_000, costMicroUsd(getAiEnv().AI_MODEL, 0, budgetTokens));
  await reserve(ctx, reserved, capUsd);
  const budget = new TokenBudget(budgetTokens);
  try {
    const result = await run(provider, budget);
    await recordUsage(ctx, result.metadata.model, result.metadata.usage.inputTokens, result.metadata.usage.outputTokens, reserved);
    return result;
  } catch (error) {
    // Failed runs still cost money: record what was spent, priced conservatively as output tokens,
    // and always release the reservation.
    await recordUsage(ctx, getAiEnv().AI_MODEL, 0, budget.spent, reserved).catch(() => undefined);
    throw error;
  }
}
