import "server-only";

import { z } from "zod";

import { createLazyEnv, optionalEnvString } from "./lazy-env";

/**
 * Server-side application environment (M1.2).
 *
 * Scope is intentionally limited to variables needed before any integration
 * exists. Supabase and AI provider sections are added in their own milestones
 * (M1.3, M2) with `createLazyEnv`. The Supabase service-role key is never read
 * here: per docs/SECURITY.md §4 it may only be read by its single isolated
 * server-only module.
 */
export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

export const appEnvSchema = z.object({
  NODE_ENV: optionalEnvString(
    z.enum(["development", "test", "production"]).default("development"),
  ),
  NEXT_PUBLIC_APP_URL: optionalEnvString(
    z.url({ protocol: /^https?$/ }).default("http://localhost:3000"),
  ),
  LOG_LEVEL: optionalEnvString(z.enum(LOG_LEVELS).default("info")),
}).superRefine((env, ctx) => {
  // Invitation links are built from this address. In production it must be the real https
  // address, so a forgotten setting fails loudly instead of sending people localhost links.
  // Plain http is accepted only for 127.0.0.1 (production builds tested locally and in CI).
  if (env.NODE_ENV !== "production") return;
  const url = new URL(env.NEXT_PUBLIC_APP_URL);
  if (url.protocol !== "https:" && url.hostname !== "127.0.0.1") {
    ctx.addIssue({ code: "custom", path: ["NEXT_PUBLIC_APP_URL"], message: "must be the public https address in production" });
  }
});

export type AppEnv = z.output<typeof appEnvSchema>;

const appEnv = createLazyEnv("application", appEnvSchema);

/** Returns the validated application environment. Validates on first call. */
export function getAppEnv(): AppEnv {
  return appEnv.get();
}
