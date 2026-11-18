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

/** Default per-request budgets by workflow. Tuned when real providers and costs are known. */
export const DEFAULT_BUDGETS = {
  analyzeThread: 24_000,
  draftReply: 20_000,
  extractCommitments: 20_000,
  proposeMemories: 16_000,
  askHistory: 40_000,
} as const;
