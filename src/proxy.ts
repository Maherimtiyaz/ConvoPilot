import { NextResponse, type NextRequest } from "next/server";

import { refreshSession } from "@/lib/supabase/proxy";

/**
 * Keeps Supabase session cookies fresh and performs convenience redirects.
 *
 * This is NOT an authorization boundary (CLAUDE.md §3, docs/ARCHITECTURE.md): the redirects use
 * an unverified "is there a session cookie?" hint. Every protected page and Server Action checks
 * the user itself with `getRequestContext()`.
 *
 * There is deliberately no "signed in → skip /login" redirect: a revoked session still has a
 * cookie, and that redirect would bounce between /login and /app (found by the E2E tests).
 */
export async function proxy(request: NextRequest) {
  const { response, hasSessionCookie } = await refreshSession(request);
  const { pathname } = request.nextUrl;

  const redirectTo = (path: string) => {
    const redirect = NextResponse.redirect(new URL(path, request.url), 303);
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  };

  if (pathname.startsWith("/app") && !hasSessionCookie) {
    return redirectTo("/login");
  }
  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and images.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
