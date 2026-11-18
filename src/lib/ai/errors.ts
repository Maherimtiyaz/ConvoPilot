/** Typed AI failures. Messages never contain prompts, model output or user content (AGENTS.md §3.12). */
export type AiErrorCode =
  | "provider_unavailable" // transient provider failure after retry
  | "provider_rejected" // non-retryable provider error (bad request, auth)
  | "timeout"
  | "invalid_output" // structured output failed validation after one repair retry
  | "budget_exceeded" // per-request token budget
  | "incomplete" // tool loop hit its round limit
  | "refused" // the model declined the request for safety reasons
  | "not_configured" // no AI provider key is set
  | "daily_limit" // the workspace reached today's AI spending cap
  | "consent_required"; // the user has not allowed hosted AI processing

export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = "AiError";
  }
}

/** Thrown by provider adapters. `retryable` marks transient failures (5xx, rate limits, network). */
export class ProviderError extends Error {
  constructor(
    readonly retryable: boolean,
    readonly kind: "network" | "rate_limited" | "server" | "client" | "timeout" | "refused",
  ) {
    super(`provider ${kind} error`);
    this.name = "ProviderError";
  }
}
