/**
 * Per-model prices in US dollars per million tokens (Anthropic list prices, Nov 2026), used for
 * the daily cost cap. Unknown models are priced as the most expensive known model.
 */
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-opus-5-5": { input: 4, output: 20 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
};
const FALLBACK_PRICE = { input: 10, output: 50 };

export function costMicroUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICES[model] ?? FALLBACK_PRICE;
  return Math.ceil(inputTokens * p.input + outputTokens * p.output); // $/1M tokens × tokens = micro-dollars
}
