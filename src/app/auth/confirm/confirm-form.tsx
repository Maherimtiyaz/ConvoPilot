"use client";

import Link from "next/link";
import { useActionState, useSyncExternalStore } from "react";

import { confirmEmailLinkAction, type FormMessage } from "@/app/auth/actions";
import { ErrorNotice, Thinking, buttonClass } from "@/components/ui";
import { useFragmentToken } from "@/components/use-fragment-token";
import { hasLinkRequestMarker } from "@/lib/auth/link-request";

const initial: FormMessage = { error: null };

const noSubscribe = () => () => undefined;
const requestedHere = () => hasLinkRequestMarker(document.cookie);

export function ConfirmForm() {
  const link = useFragmentToken("th");
  const [state, formAction, pending] = useActionState(confirmEmailLinkAction, initial);
  // Unknown on the server; read in the browser after hydration.
  const askedHere = useSyncExternalStore(noSubscribe, requestedHere, () => true);

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
      {askedHere ? (
        <p>Press continue to finish signing in on this device.</p>
      ) : (
        <div role="note" className="rounded-xl border border-warning/30 bg-warning-50 px-3.5 py-3 text-sm text-ink-700">
          <p className="font-semibold text-ink">Did you ask for this link?</p>
          <p className="mt-1">
            Opening it on a different device from the one you used is fine. But if someone sent you this link, don&apos;t
            continue: it would sign you into <em>their</em> account.
          </p>
        </div>
      )}
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? <Thinking label="Signing in…" /> : <>Continue <span className="cp-arrow" aria-hidden="true">→</span></>}
      </button>
    </form>
  );
}
