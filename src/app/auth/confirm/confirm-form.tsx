"use client";

import Link from "next/link";
import { useActionState } from "react";

import { confirmEmailLinkAction, type FormMessage } from "@/app/auth/actions";
import { buttonClass, ErrorNotice } from "@/components/ui";
import { useFragmentToken } from "@/components/use-fragment-token";

const initial: FormMessage = { error: null };

export function ConfirmForm() {
  const link = useFragmentToken("th");
  const [state, formAction, pending] = useActionState(confirmEmailLinkAction, initial);

  if (link.status === "reading") {
    return <p aria-live="polite">Checking your link…</p>;
  }
  if (link.status === "missing" || state.error) {
    return (
      <div className="space-y-4">
        <ErrorNotice message={state.error ?? "This sign-in link is invalid or has expired. Request a new link to continue."} />
        <Link href="/login" className={buttonClass}>
          Request a new link
        </Link>
      </div>
    );
  }
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="tokenHash" value={link.token} />
      <p>Press continue to finish signing in on this device.</p>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Signing in…" : "Continue"}
      </button>
    </form>
  );
}
