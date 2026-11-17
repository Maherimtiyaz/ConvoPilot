"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { saveSenderAction } from "../contacts/actions";

/** "Save as contact" for a sender, or a link to the contact once saved. */
export function SenderContact({ name, email, contactId }: { name: string | null; email: string; contactId: string | undefined }) {
  const [savedId, setSavedId] = useState<string | undefined>(contactId);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (savedId) {
    return (
      <Link href={`/app/contacts/${savedId}`} className="ml-2 font-mono text-[11px] text-route hover:underline">
        View contact
      </Link>
    );
  }
  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await saveSenderAction(name ?? "", email);
            if (result.contactId) setSavedId(result.contactId);
            setError(result.error);
          })
        }
        className="ml-2 rounded-full border border-ink-300 px-2 py-0.5 font-mono text-[11px] text-ink-700 hover:bg-ink-100 disabled:opacity-50"
      >
        {pending ? "Saving…" : "Save as contact"}
      </button>
      {error && (
        <span role="alert" className="ml-2 text-xs text-error">
          {error}
        </span>
      )}
    </>
  );
}
