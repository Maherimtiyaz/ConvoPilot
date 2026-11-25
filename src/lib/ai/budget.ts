import { AiError } from "./errors";
import type { TokenUsage } from "./types";

/**
 * Per-request token budget (§9). Every model call reserves its worst case (prompt estimate +
 * max output) before running and records real usage after. The per-workspace daily cap is a
 * database ledger added with the first real provider (M3), once the owner sets the cap.
 */
export class TokenBudget {
  private used = 0;

  constructor(readonly limit: number) {
    if (!Number.isInteger(limit) || limit <= 0) throw new Error("Invalid token budget");
  }

  get remaining(): number {
    return Math.max(0, this.limit - this.used);
  }

  get spent(): number {
    return this.used;
  }

  /** Throws budget_exceeded if a call of this worst-case size could exceed the budget. */
  ensure(worstCaseTokens: number): void {
    if (worstCaseTokens > this.remaining) throw new AiError("budget_exceeded");
  }

  record(usage: TokenUsage): void {
    this.used += Math.max(0, usage.inputTokens) + Math.max(0, usage.outputTokens);
  }
}

/** Rough token estimate for budgeting (≈ 4 characters per token, rounded up). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Per-request token budgets by workflow. Conversations are trimmed to the newest
 * AI_INPUT_CHAR_LIMIT characters (≈12.5k tokens), so a full call plus one repair round fits:
 * prompt ≈ 15k + output ≤ 8k, then the repair resends both (≈ 23k) plus up to 8k more output.
 * Reviewed 2026-11-25: the earlier 20–24k budgets rejected most repair rounds.
 */
export const DEFAULT_BUDGETS = {
  analyzeThread: 56_000,
  draftReply: 50_000,
  extractCommitments: 50_000,
  proposeMemories: 16_000,
  askHistory: 40_000,
} as const;

export type AiWorkflow = keyof typeof DEFAULT_BUDGETS;

/**
 * Worst-case output tokens per workflow (two calls for structured output; four tool rounds for
 * ask-history). The cost reservation prices these as output and the rest of the budget as input.
 */
export const WORST_CASE_OUTPUT_TOKENS: Record<AiWorkflow, number> = {
  analyzeThread: 16_000,
  draftReply: 12_000,
  extractCommitments: 12_000,
  proposeMemories: 8_000,
  askHistory: 16_000,
};
