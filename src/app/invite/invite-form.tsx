"use client";

import Link from "next/link";
import { useActionState } from "react";

import { requestInvitationSignupAction, type FormMessage } from "@/app/auth/actions";
import { buttonClass, ErrorNotice, inputClass } from "@/components/ui";
import { useFragmentToken } from "@/components/use-fragment-token";

const initial: FormMessage = { error: null };

export function InviteForm() {
  const invitation = useFragmentToken("t");
  const [state, formAction, pending] = useActionState(requestInvitationSignupAction, initial);

  if (invitation.status === "reading") {
    return <p aria-live="polite">Checking your invitation link…</p>;
  }
  if (invitation.status === "missing") {
    return (
      <p role="alert">
        This invitation link is incomplete. Open the full link from your invitation email, or{" "}
        <Link href="/login" className="font-medium text-route underline">
          sign in
        </Link>{" "}
        if you already have an account.
      </p>
    );
  }
  return (
    <form action={formAction} className="space-y-4">
      <ErrorNotice message={state.error} />
      <input type="hidden" name="token" value={invitation.token} />
      <div className="space-y-1">
        <label htmlFor="email" className="font-medium text-ink">
          The email address this invitation was sent to
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required maxLength={320} className={inputClass} />
      </div>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Sending…" : "Create my account"}
      </button>
    </form>
  );
}
