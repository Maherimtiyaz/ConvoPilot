import "server-only";

import Anthropic from "@anthropic-ai/sdk";

import { ProviderError } from "../errors";
import type { AiProvider, ChatMessage, GenerateRequest, GenerateResult } from "../provider";

/**
 * Anthropic adapter (decision P3/P4: Anthropic, official SDK). The only file that imports the SDK.
 * - Server-side refusal fallback is enabled ("default" routing by refusal category).
 * - SDK retries are off: callModel() owns the single retry, so failures map to typed errors.
 * - Provider error bodies are never logged or returned.
 */
export function createAnthropicProvider(options: { apiKey: string; model: string; baseURL?: string }): AiProvider {
  const client = new Anthropic({ apiKey: options.apiKey, baseURL: options.baseURL, maxRetries: 0 });

  return {
    id: "anthropic",
    async generate(request: GenerateRequest): Promise<GenerateResult> {
      const system = request.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
      try {
        const response = await client.beta.messages.create(
          {
            model: options.model,
            max_tokens: request.maxOutputTokens,
            ...(system ? { system } : {}),
            messages: toAnthropicMessages(request.messages),
            ...(request.tools?.length
              ? { tools: request.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters as Anthropic.Beta.BetaTool.InputSchema })) }
              : {}),
            output_config: { effort: "medium" },
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
          },
          { timeout: request.timeoutMs, signal: request.signal },
        );

        if (response.stop_reason === "refusal") throw new ProviderError(false, "refused");

        let text = "";
        const toolCalls: GenerateResult["toolCalls"] = [];
        for (const block of response.content) {
          if (block.type === "text") text += block.text;
          else if (block.type === "tool_use") toolCalls.push({ id: block.id, name: block.name, arguments: block.input });
        }
        return {
          text,
          toolCalls,
          usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
          model: response.model,
          finishReason: response.stop_reason === "tool_use" ? "tool_calls" : response.stop_reason === "max_tokens" ? "length" : response.stop_reason === "end_turn" ? "stop" : "other",
          providerState: response.content,
        };
      } catch (error) {
        throw mapError(error);
      }
    },
  };
}

function toAnthropicMessages(messages: ChatMessage[]): Anthropic.Beta.BetaMessageParam[] {
  const out: Anthropic.Beta.BetaMessageParam[] = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    if (m.role === "user") out.push({ role: "user", content: m.content });
    else if (m.role === "assistant") {
      // Send the model's own content blocks back unchanged (thinking blocks included).
      const blocks = Array.isArray(m.providerState) ? (m.providerState as Anthropic.Beta.BetaContentBlockParam[]) : null;
      out.push({ role: "assistant", content: blocks ?? m.content });
    } else {
      // Tool results go back in one user message, as tool_result blocks.
      const result: Anthropic.Beta.BetaToolResultBlockParam = { type: "tool_result", tool_use_id: m.toolCallId ?? "", content: m.content };
      const last = out.at(-1);
      if (last && last.role === "user" && Array.isArray(last.content) && last.content.every((b) => b.type === "tool_result")) {
        (last.content as Anthropic.Beta.BetaToolResultBlockParam[]).push(result);
      } else {
        out.push({ role: "user", content: [result] });
      }
    }
  }
  return out;
}

function mapError(error: unknown): unknown {
  if (error instanceof ProviderError) return error;
  if (error instanceof Anthropic.APIConnectionTimeoutError) return new ProviderError(true, "timeout");
  if (error instanceof Anthropic.APIConnectionError) return new ProviderError(true, "network");
  if (error instanceof Anthropic.RateLimitError) return new ProviderError(true, "rate_limited");
  if (error instanceof Anthropic.InternalServerError) return new ProviderError(true, "server");
  if (error instanceof Anthropic.APIError) {
    const status = error.status ?? 0;
    return new ProviderError(status === 408 || status === 409 || status === 529 || status >= 500, status >= 500 ? "server" : "client");
  }
  return new ProviderError(true, "network");
}
