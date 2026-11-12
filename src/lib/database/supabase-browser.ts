import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/validation/env";

export function createClient(): SupabaseClient | null {
  const env = getServerEnv();
  if (!env) return null;
  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
