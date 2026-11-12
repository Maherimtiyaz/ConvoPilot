import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getServerEnv } from "@/lib/validation/env";

/**
 * Server client bound to the request cookies (carries the user session).
 * Returns null when Supabase is not configured yet so pages can render a
 * setup notice instead of crashing.
 */
export async function createClient(): Promise<SupabaseClient | null> {
  const env = getServerEnv();
  if (!env) return null;

  const cookieStore = await cookies();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component render pass where cookies are
          // read-only; the proxy/route layer performs the actual refresh.
        }
      },
    },
  });
}

/**
 * Admin client using the service role key. Bypasses RLS — only for trusted
 * server-side jobs (e.g. provisioning). Never import from client components.
 */
export function createAdminClient(): SupabaseClient | null {
  const env = getServerEnv();
  if (!env?.SUPABASE_SERVICE_ROLE_KEY) return null;

  return createSupabaseClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
