import type { CookieOptions } from "@supabase/ssr";

/** How long a signed-in browser stays signed in while it keeps being used (CLAUDE.md §10). */
export const SESSION_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * Enforces ConvoPilot's session-cookie policy on every cookie @supabase/ssr writes:
 *
 * - `httpOnly`: page scripts cannot read the session (there is no browser Supabase client).
 * - `sameSite: "lax"` and `path: "/"`.
 * - `secure` in production.
 * - our own lifetime: @supabase/ssr always asks for 400 days; removals (maxAge 0) stay removals.
 */
export function hardenSessionCookieOptions(
  options: CookieOptions | undefined,
  { production }: { production: boolean },
): CookieOptions {
  const isRemoval = options?.maxAge === 0;
  return {
    ...options,
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: production,
    maxAge: isRemoval ? 0 : SESSION_COOKIE_MAX_AGE_SECONDS,
  };
}

export const isProductionRuntime = () => process.env.NODE_ENV === "production";
