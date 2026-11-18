import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseEnv } from "@/lib/env/supabase";

import { hardenSessionCookieOptions, isProductionRuntime } from "./cookies";

/**
 * Refreshes the Supabase session cookies for a request (used only by `src/proxy.ts`).
 *
 * `getSession()` refreshes an expired access token using the refresh token and writes the new
 * cookies. Its result is used ONLY as an optimistic "is there a session cookie?" hint for
 * redirects — never as proof of identity. The authoritative check is `getRequestContext()`
 * (`auth.getUser()`) inside every protected render and Server Action.
 *
 * Refreshed cookies are written to the outgoing response AND to the forwarded request, so the
 * page rendered for this same request sees the new session instead of refreshing again.
 */
export async function refreshSession(request: NextRequest) {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = getSupabaseEnv();
  const production = isProductionRuntime();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, hardenSessionCookieOptions(options, { production }));
        }
      },
    },
  });

  const { data } = await supabase.auth.getSession();
  return { response, hasSessionCookie: data.session !== null };
}
