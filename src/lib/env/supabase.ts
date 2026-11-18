import "server-only";

import { z } from "zod";

import { createLazyEnv, optionalEnvString } from "./lazy-env";

/**
 * Supabase environment for the Next.js application (M1.3).
 *
 * Only the project URL and the publishable (anon) key are read here. Both are
 * public by design; access control is enforced by RLS and database functions.
 * The service-role key is deliberately absent: it is used only by the isolated
 * privileged runner and must never be present in the Next.js runtime
 * (docs/SECURITY.md §4).
 *
 * Like every section built on createLazyEnv, call getSupabaseEnv() only from
 * request-time code; see lazy-env.ts.
 */
export const supabaseEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: optionalEnvString(z.url({ protocol: /^https?$/ })),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalEnvString(z.string().min(20)),
});

export type SupabaseEnv = z.output<typeof supabaseEnvSchema>;

const supabaseEnv = createLazyEnv("Supabase", supabaseEnvSchema);

/** Returns the validated Supabase environment. Validates on first call. */
export function getSupabaseEnv(): SupabaseEnv {
  return supabaseEnv.get();
}
