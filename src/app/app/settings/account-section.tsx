"use client";

import { useState, useTransition } from "react";

import { deleteAccountAction, exportDataAction } from "./account-actions";

const secondary = "rounded-xl border border-ink-300 bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-white/60 disabled:opacity-50";

/** Data rights: download everything, or delete the account (SECURITY.md §14). */
export function AccountDataSection() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");

  return (
    <section aria-labelledby="data-heading" className="cp-glass rounded-3xl p-6">
      <h2 id="data-heading" className="text-base font-semibold text-ink">
        Your data
      </h2>
      <p className="mt-1 text-sm text-ink-700">Download a copy of everything in your workspace, or delete your account.</p>
      {error && (
        <p role="alert" className="mt-3 rounded-xl border border-error/30 bg-error-50 px-3 py-2 text-sm text-error">
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={pending}
          className={secondary}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await exportDataAction();
              if (r.error || !r.json) return setError(r.error ?? "The export failed. Please try again.");
              const url = URL.createObjectURL(new Blob([r.json], { type: "application/json" }));
              const a = document.createElement("a");
              a.href = url;
              a.download = r.fileName ?? "convopilot-export.json";
              a.click();
              URL.revokeObjectURL(url);
            })
          }
        >
          Download my data
        </button>
        {!confirming && (
          <button type="button" onClick={() => setConfirming(true)} className="rounded-xl px-4 py-2 text-sm font-medium text-error hover:bg-error-50">
            Delete my account…
          </button>
        )}
      </div>
      {confirming && (
        <div className="mt-4 rounded-xl border border-error/30 bg-error-50 p-4 text-sm">
          <p className="font-semibold text-error">This can&apos;t be undone from the app.</p>
          <p className="mt-1 text-ink-700">
            Your workspace, conversations, contacts, drafts and tasks become inaccessible immediately, you&apos;re signed out everywhere, and the data is permanently erased after 30 days (until then the ConvoPilot team can restore your account if you ask).
            Download your data first if you want a copy.
          </p>
          <label className="mt-3 block space-y-1 font-medium">
            <span>Type “delete my account” to confirm</span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} className="block h-10 w-full max-w-sm rounded-xl border border-ink-300 bg-white px-3" />
          </label>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              disabled={pending || typed.trim().toLowerCase() !== "delete my account"}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const r = await deleteAccountAction(typed);
                  if (r?.error) setError(r.error);
                })
              }
              className="h-10 rounded-xl bg-error px-4 font-semibold text-white disabled:opacity-50"
            >
              {pending ? "Deleting…" : "Delete my account"}
            </button>
            <button type="button" onClick={() => (setConfirming(false), setTyped(""))} className="h-10 rounded-xl border border-ink-300 bg-white px-4">
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
