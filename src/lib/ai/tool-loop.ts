import type { TokenBudget } from "./budget";
import { callModel } from "./call";
import { AiError } from "./errors";
import type { AiProvider, ChatMessage } from "./provider";
import type { AuditSink } from "./tools/audit";
import { executeToolCall } from "./tools/executor";
import type { ToolRegistry } from "./tools/registry";
import type { AiContext } from "./types";
import { untrustedPreamble } from "./untrusted";

export const MAX_TOOL_ROUNDS = 4;
const MAX_CALLS_PER_ROUND = 6;

export type ToolLoopResult =
  | { status: "answered"; text: string; rounds: number; model: string }
  | { status: "incomplete"; reason: "max_rounds" | "budget"; rounds: number };

/**
 * Bounded read-only tool loop for open-ended questions (askHistory only; §1). At most
 * MAX_TOOL_ROUNDS rounds of tool calls; exceeding rounds or the token budget returns a typed
 * incomplete result instead of an answer.
 */
export async function runToolLoop(options: {
  provider: AiProvider;
  ctx: AiContext;
  registry: ToolRegistry;
  audit: AuditSink;
  budget: TokenBudget;
  system: string;
  user: string;
  nonce: string;
  maxOutputTokens?: number;
  maxRounds?: number;
}): Promise<ToolLoopResult> {
  const { provider, ctx, registry, audit, budget, nonce } = options;
  if (ctx.workflow !== "askHistory") throw new Error("The tool loop is only for askHistory");
  const maxRounds = Math.min(options.maxRounds ?? MAX_TOOL_ROUNDS, MAX_TOOL_ROUNDS);
  const tools = registry.specsFor(ctx.workflow);
  const messages: ChatMessage[] = [
    { role: "system", content: `${options.system}\n\n${untrustedPreamble(nonce)}` },
    { role: "user", content: options.user },
  ];

  for (let round = 0; ; round++) {
    let result;
    try {
      result = await callModel(provider, { messages, tools, maxOutputTokens: options.maxOutputTokens ?? 1_200 }, budget);
    } catch (error) {
      if (error instanceof AiError && error.code === "budget_exceeded") return { status: "incomplete", reason: "budget", rounds: round };
      throw error;
    }
    if (result.toolCalls.length === 0) return { status: "answered", text: result.text, rounds: round, model: result.model };
    if (round >= maxRounds) return { status: "incomplete", reason: "max_rounds", rounds: round };

    const calls = result.toolCalls.slice(0, MAX_CALLS_PER_ROUND);
    messages.push({ role: "assistant", content: result.text, toolCalls: calls, providerState: result.providerState });
    for (const call of calls) {
      const outcome = await executeToolCall(ctx, call, registry, audit, nonce);
      messages.push({ role: "tool", toolCallId: outcome.toolCallId, content: outcome.content });
    }
  }
}
