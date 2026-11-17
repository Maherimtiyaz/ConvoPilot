/**
 * Fixed, user-facing reasons for authentication problems. Raw Supabase/Auth messages are never
 * shown or logged: they can contain internal details (CLAUDE.md §10).
 */
export type AuthProblem =
  | "invalid_email"
  | "invitation_invalid"
  | "link_invalid"
  | "rate_limited"
  | "unexpected";

export const AUTH_PROBLEM_MESSAGES: Record<AuthProblem, string> = {
  invalid_email: "Please enter a valid email address.",
  invitation_invalid:
    "This invitation can't be used. Check that you entered the email address it was sent to. If you already have an account, sign in instead.",
  link_invalid:
    "This sign-in link is invalid or has expired. Request a new link to continue.",
  rate_limited: "Too many attempts. Please wait a few minutes and try again.",
  unexpected: "Something went wrong on our side. Please try again in a moment.",
};

interface AuthErrorLike {
  status?: number;
  code?: string;
}

/** Maps a Supabase Auth error from sending a sign-up (invitation) email. */
export function problemFromInvitationSignupError(error: AuthErrorLike): AuthProblem {
  if (error.status === 429 || error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit") {
    return "rate_limited";
  }
  if (error.status === 403 || error.status === 422 || error.status === 400) {
    return "invitation_invalid";
  }
  return "unexpected";
}

/**
 * Maps a Supabase Auth error from sending a returning-user sign-in email. Anything that would
 * reveal whether an account exists (e.g. 422 `otp_disabled` for unknown emails) maps to `null`,
 * meaning "show the same 'check your email' page as for success".
 */
export function problemFromLoginLinkError(error: AuthErrorLike): AuthProblem | null {
  if (error.status === 429 || error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit") {
    return "rate_limited";
  }
  if (error.status !== undefined && error.status >= 500) {
    return "unexpected";
  }
  return null;
}

/** Maps a Supabase Auth error from verifying an email link (used, expired and unknown look alike). */
export function problemFromVerifyError(error: AuthErrorLike): AuthProblem {
  if (error.status === 429) {
    return "rate_limited";
  }
  if (error.status !== undefined && error.status >= 500) {
    return "unexpected";
  }
  return "link_invalid";
}
