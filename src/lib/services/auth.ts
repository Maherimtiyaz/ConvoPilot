import "server-only";

import {
  problemFromInvitationSignupError,
  problemFromLoginLinkError,
  problemFromVerifyError,
  type AuthProblem,
} from "@/lib/auth/errors";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthOutcome = { ok: true } | { ok: false; problem: AuthProblem };

/**
 * Sends a sign-in link to an existing account. Never creates accounts. Unknown emails get the
 * same outcome as known ones, so this page does not reveal who has an account.
 */
export async function requestLoginLink(email: string): Promise<AuthOutcome> {
  const supabase = await createSupabaseServerClient("server-action");
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (error) {
    const problem = problemFromLoginLinkError(error);
    if (problem) {
      return { ok: false, problem };
    }
  }
  return { ok: true };
}

/**
 * Sends the account-creation email for an invitation. The database (Auth hook and sign-up
 * trigger) checks that the invitation is valid, unexpired, unused and bound to this email, and
 * consumes it atomically when the account is created. If the person already has an account,
 * Supabase sends a normal sign-in link instead (the invitation is then ignored).
 */
export async function requestInvitationSignup(email: string, invitationToken: string): Promise<AuthOutcome> {
  const supabase = await createSupabaseServerClient("server-action");
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, data: { invitation_token: invitationToken } },
  });
  if (error) {
    return { ok: false, problem: problemFromInvitationSignupError(error) };
  }
  return { ok: true };
}

/** Completes an email link (new or returning user). Used, expired and unknown links look alike. */
export async function confirmEmailLink(tokenHash: string): Promise<AuthOutcome> {
  const supabase = await createSupabaseServerClient("server-action");
  const { error } = await supabase.auth.verifyOtp({ type: "email", token_hash: tokenHash });
  if (error) {
    return { ok: false, problem: problemFromVerifyError(error) };
  }
  return { ok: true };
}

/** Signs out this browser ("local") or every device ("global"). Session cookies are always cleared. */
export async function signOut(scope: "local" | "global"): Promise<void> {
  const supabase = await createSupabaseServerClient("server-action");
  const { error } = await supabase.auth.signOut({ scope });
  if (error && scope === "global") {
    // Make sure this browser is signed out even if revoking other sessions failed.
    await supabase.auth.signOut({ scope: "local" });
    throw new Error("Signing out of other devices failed");
  }
}
