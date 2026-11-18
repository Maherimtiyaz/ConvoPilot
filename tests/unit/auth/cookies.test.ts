import { describe, expect, it } from "vitest";

import { hardenSessionCookieOptions, SESSION_COOKIE_MAX_AGE_SECONDS } from "@/lib/supabase/cookies";

describe("hardenSessionCookieOptions", () => {
  it("forces HttpOnly, SameSite=Lax, path / and our 30-day lifetime", () => {
    const options = hardenSessionCookieOptions({ httpOnly: false, sameSite: "none", path: "/x", maxAge: 400 * 86400 }, { production: false });
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", secure: false, maxAge: SESSION_COOKIE_MAX_AGE_SECONDS });
    expect(SESSION_COOKIE_MAX_AGE_SECONDS).toBe(30 * 24 * 60 * 60);
  });

  it("marks cookies Secure in production", () => {
    expect(hardenSessionCookieOptions(undefined, { production: true }).secure).toBe(true);
  });

  it("keeps cookie removals as removals", () => {
    expect(hardenSessionCookieOptions({ maxAge: 0 }, { production: true }).maxAge).toBe(0);
  });
});
