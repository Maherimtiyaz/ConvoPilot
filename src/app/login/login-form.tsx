"use client";

import { useActionState } from "react";

import { requestLoginLinkAction, type FormMessage } from "@/app/auth/actions";
import { buttonClass, ErrorNotice, inputClass } from "@/components/ui";

const initial: FormMessage = { error: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(requestLoginLinkAction, initial);
  return (
    <form action={formAction} className="space-y-4">
      <ErrorNotice message={state.error} />
      <div className="space-y-1">
        <label htmlFor="email" className="font-medium text-ink">
          Email address
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required maxLength={320} className={inputClass} />
      </div>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Sending…" : "Email me a sign-in link"}
      </button>
    </form>
  );
}
