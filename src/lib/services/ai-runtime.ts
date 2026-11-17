import "server-only";

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

async function ensureAiAllowed(ctx: RequestContext): Promise<void> {
  const settings = await getAiSettings(ctx, "server-action");
  if (!settings.configured) throw new AiError("not_configured");
  if (!settings.optIn) throw new AiError("consent_required");
  if (settings.spentTodayUsd >= settings.capUsd) throw new AiError("daily_limit");
}

async function recordUsage(ctx: RequestContext, model: string, inputTokens: number, outputTokens: number): Promise<void> {
  const supabase = await createSupabaseServerClient("server-action");
  const { error } = await supabase.rpc("record_ai_usage", {
    p_workspace_id: ctx.workspaceId,
    p_input_tokens: inputTokens,
    p_output_tokens: outputTokens,
    p_cost_micro_usd: costMicroUsd(model, inputTokens, outputTokens),
  });
  if (error) throw new StudioError("failed");
}

/** Runs a workflow under the consent check, daily cap and per-request budget, always recording spend. */
export async function withAi<T extends { metadata: ModelMetadata }>(ctx: RequestContext, budgetTokens: number, run: (provider: AiProvider, budget: TokenBudget) => Promise<T>): Promise<T> {
  await ensureAiAllowed(ctx);
  const provider = providerFromEnv();
  const budget = new TokenBudget(budgetTokens);
  try {
    const result = await run(provider, budget);
    await recordUsage(ctx, result.metadata.model, result.metadata.usage.inputTokens, result.metadata.usage.outputTokens);
    return result;
  } catch (error) {
    // Failed runs still cost money: record what was spent, priced conservatively as output tokens.
    if (budget.spent > 0) await recordUsage(ctx, getAiEnv().AI_MODEL, 0, budget.spent).catch(() => undefined);
    throw error;
  }
}

