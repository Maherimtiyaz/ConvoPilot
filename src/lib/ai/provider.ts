import type { TokenUsage } from "./types";

/**
 * The only interface business logic uses to talk to a model (locked decision: provider-agnostic AI).
 * Vendor SDKs are imported only inside adapters under `src/lib/ai/providers/` (none in M2; the
 * first real adapter arrives with decision P3/P4 in M3). Adapters throw ProviderError.
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** For role "tool": which call this result answers. */
  toolCallId?: string;
  /** For role "assistant": tool calls the model made in this turn. */
  toolCalls?: ToolCallRequest[];
  /**
   * Opaque provider data for an assistant turn (e.g. the raw content blocks, including thinking
   * blocks that must be sent back unchanged). Only the adapter that produced it reads it.
   */
  providerState?: unknown;
}

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema of the arguments, derived from the tool's Zod schema. */
  parameters: Record<string, unknown>;
}

export interface ToolCallRequest {
  id: string;
  name: string;
  /** Raw arguments as produced by the model. Untrusted; validated by the executor. */
  arguments: unknown;
}

export interface GenerateRequest {
  messages: ChatMessage[];
  /** Ask for a single JSON object as the answer. */
  json?: boolean;
  tools?: ToolSpec[];
  maxOutputTokens: number;
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface GenerateResult {
  text: string;
  toolCalls: ToolCallRequest[];
  usage: TokenUsage;
  model: string;
  finishReason: "stop" | "tool_calls" | "length" | "other";
  /** Opaque data to attach to the assistant turn if the conversation continues (tool loop). */
  providerState?: unknown;
}

export interface AiProvider {
  /** Stable identifier stored in model metadata, e.g. "test" or a vendor name. */
  readonly id: string;
  generate(request: GenerateRequest): Promise<GenerateResult>;
}
