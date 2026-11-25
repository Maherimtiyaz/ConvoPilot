/**
 * Marks the browser that asked for a sign-in link (security review 2026-11-22, R7: login CSRF).
 *
 * Someone with an account could send a victim *their own* sign-in link; pressing Continue would
 * put the victim in the attacker's workspace. Links must keep working on another device (asked on
 * a laptop, opened on a phone), so a missing marker does not block sign-in: the confirm page shows
 * a clear warning instead. The cookie holds no secret (just "1"), so it is readable by the page.
 */
export const LINK_REQUEST_COOKIE = "cp_link_requested";
export const LINK_REQUEST_MAX_AGE_SECONDS = 60 * 60; // link lifetime is 30 minutes; allow some slack

/** True when this browser's cookies show it asked for a link recently. */
export function hasLinkRequestMarker(cookieHeader: string): boolean {
  return cookieHeader.split(";").some((part) => part.trim() === `${LINK_REQUEST_COOKIE}=1`);
}
