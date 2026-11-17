"use server";

import { redirect } from "next/navigation";

import { AUTH_PROBLEM_MESSAGES } from "@/lib/auth/errors";
import { DEFAULT_SIGNED_IN_PATH } from "@/lib/auth/redirect";
import { confirmEmailLink, requestInvitationSignup, requestLoginLink, signOut } from "@/lib/services/auth";
import { confirmFormSchema, invitationFormSchema, loginFormSchema, signOutFormSchema } from "@/lib/validation/auth";

/** Shown in forms. Only fixed messages: raw Auth errors are never returned to the browser. */
export interface FormMessage {
  error: string | null;
}

const field = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
};

export async function requestLoginLinkAction(_prev: FormMessage, formData: FormData): Promise<FormMessage> {
  const parsed = loginFormSchema.safeParse({ email: field(formData, "email") });
  if (!parsed.success) {
    return { error: AUTH_PROBLEM_MESSAGES.invalid_email };
  }
  const outcome = await requestLoginLink(parsed.data.email);
  if (!outcome.ok) {
    return { error: AUTH_PROBLEM_MESSAGES[outcome.problem] };
  }
  redirect("/auth/check-email");
}

export async function requestInvitationSignupAction(_prev: FormMessage, formData: FormData): Promise<FormMessage> {
  const parsed = invitationFormSchema.safeParse({ email: field(formData, "email"), token: field(formData, "token") });
  if (!parsed.success) {
    const emailOk = loginFormSchema.safeParse({ email: field(formData, "email") }).success;
    return { error: AUTH_PROBLEM_MESSAGES[emailOk ? "invitation_invalid" : "invalid_email"] };
  }
  const outcome = await requestInvitationSignup(parsed.data.email, parsed.data.token);
  if (!outcome.ok) {
    return { error: AUTH_PROBLEM_MESSAGES[outcome.problem] };
  }
  redirect("/auth/check-email");
}

export async function confirmEmailLinkAction(_prev: FormMessage, formData: FormData): Promise<FormMessage> {
  const parsed = confirmFormSchema.safeParse({ tokenHash: field(formData, "tokenHash") });
  if (!parsed.success) {
    return { error: AUTH_PROBLEM_MESSAGES.link_invalid };
  }
  const outcome = await confirmEmailLink(parsed.data.tokenHash);
  if (!outcome.ok) {
    return { error: AUTH_PROBLEM_MESSAGES[outcome.problem] };
  }
  redirect(DEFAULT_SIGNED_IN_PATH);
}

/** Sign-out needs no identity check: it only ever affects the caller's own session. */
export async function signOutAction(formData: FormData): Promise<void> {
  const parsed = signOutFormSchema.safeParse({ scope: field(formData, "scope") });
  await signOut(parsed.success ? parsed.data.scope : "local");
  redirect("/login");
}
