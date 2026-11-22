import "server-only";

import { z } from "zod";

import { createLazyEnv, optionalEnvString } from "./lazy-env";

/**
 * AI provider environment (M3; decision P3: Anthropic). Server-only. The API key is a secret:
 * it lives only in hosting settings or a gitignored .env.local, never in code or logs.
 * Without a key, AI features report "not configured" instead of failing.
 */
export const aiEnvSchema = z.object({
  NODE_ENV: optionalEnvString(z.enum(["development", "test", "production"]).default("development")),
  ANTHROPIC_API_KEY: optionalEnvString(z.string().min(10).optional()),
  /** Optional override, used only by end-to-end tests to point at a local mock server. */
  ANTHROPIC_BASE_URL: optionalEnvString(z.url({ protocol: /^https?$/ }).optional()),
  AI_MODEL: optionalEnvString(z.string().regex(/^claude-[a-z0-9-]+$/).default("claude-opus-5-5")),
  /** Per-workspace daily AI spending cap in US dollars (owner decision: 1). */
  AI_DAILY_COST_CAP_USD: optionalEnvString(z.coerce.number().positive().max(100).default(1)),
}).superRefine((env, ctx) => {
  // In production, conversations and the API key may only go to Anthropic over https. The only
  // other address allowed is the local mock on 127.0.0.1 (production builds tested in CI).
  if (env.NODE_ENV !== "production" || !env.ANTHROPIC_BASE_URL) return;
  const url = new URL(env.ANTHROPIC_BASE_URL);
  const anthropic = url.protocol === "https:" && url.hostname === "api.anthropic.com";
  if (!anthropic && url.hostname !== "127.0.0.1") {
    ctx.addIssue({ code: "custom", path: ["ANTHROPIC_BASE_URL"], message: "only https://api.anthropic.com (or the local test mock) is allowed in production" });
  }
});

export type AiEnv = z.output<typeof aiEnvSchema>;

const aiEnv = createLazyEnv("AI", aiEnvSchema);

export function getAiEnv(): AiEnv {
  return aiEnv.get();
}
