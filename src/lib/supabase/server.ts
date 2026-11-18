import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { getSupabaseEnv } from "@/lib/env/supabase";

import { hardenSessionCookieOptions, isProductionRuntime } from "./cookies";

/**
 * Where the client is being created. Server Components cannot write cookies, so
 * session-cookie refreshes are written by Server Actions, Route Handlers and `proxy.ts`.
 */
export type SupabaseServerContext = "server-component" | "server-action" | "route-handler";

/**
 * Creates a Supabase client bound to the current user's session cookies.
 *
 * Every query made with this client runs as the signed-in user (or as `anon` when signed
 * out), so Row Level Security and the database's function grants always apply. This is the
 * only Supabase client allowed on Next.js request paths; there is no service-role client and
 * no browser Supabase client in `src/` (docs/SECURITY.md §4, CLAUDE.md §10).
 *
 * Session cookies are always HttpOnly (see `hardenSessionCookieOptions`).
 * The client is created per request and must not be cached or shared.
 */
export async function createSupabaseServerClient(context: SupabaseServerContext) {
  // Read cookies first: it marks the render as request-time, so nothing below runs during prerendering.
  const cookieStore = await cookies();
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getSupabaseEnv();
  const canWriteCookies = context !== "server-component";
  const production = isProductionRuntime();

  return createServerClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        if (!canWriteCookies) {
          // Intentional, not an error being swallowed: Server Components cannot set cookies.
          // Refreshed session cookies are written by proxy.ts, Server Actions and Route Handlers.
          return;
        }
        for (const { name, value, options } of cookiesToSet) {
          cookieStore.set(name, value, hardenSessionCookieOptions(options, { production }));
        }
      },
    },
  });
}
