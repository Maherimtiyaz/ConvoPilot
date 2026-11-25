import { estimateTokens, type TokenBudget } from "./budget";
import { AiError, ProviderError } from "./errors";
import { AI_CALL_TIMEOUT_MS } from "./limits";
import type { AiProvider, GenerateRequest, GenerateResult } from "./provider";

const DEFAULT_TIMEOUT_MS = AI_CALL_TIMEOUT_MS;

/**
 * One budgeted model call with a timeout and one retry for transient provider errors other than
 * timeouts (§9).
 * Provider error bodies are never logged or surfaced.
 */
export async function callModel(
  provider: AiProvider,
  request: Omit<GenerateRequest, "timeoutMs"> & { timeoutMs?: number },
  budget: TokenBudget,
): Promise<GenerateResult> {
  const promptTokens = estimateTokens(request.messages.map((m) => m.content).join("\n"));
  budget.ensure(promptTokens + request.maxOutputTokens);
  const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  for (let attempt = 1; ; attempt++) {
    try {
      const result = await withTimeout(provider.generate({ ...request, timeoutMs }), timeoutMs);
      budget.record(result.usage);
      return result;
    } catch (error) {
      // A timeout is not retried: it would double the wait and the cost (review 2026-11-25).
      const retryable = error instanceof ProviderError ? error.retryable && error.kind !== "timeout" : false;
      if (attempt === 1 && retryable) continue;
      if (error instanceof AiError) throw error;
      if (error instanceof ProviderError) {
        if (error.kind === "timeout") throw new AiError("timeout");
        if (error.kind === "refused") throw new AiError("refused");
        throw new AiError(error.retryable ? "provider_unavailable" : "provider_rejected");
      }
      throw new AiError("provider_unavailable");
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ProviderError(true, "timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
