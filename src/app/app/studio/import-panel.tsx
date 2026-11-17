"use client";

import { useActionState, useState } from "react";

import { buttonClass, ErrorNotice, inputClass } from "@/components/ui";

import { importAction, type ActionState } from "./actions";

const initial: ActionState = { error: null };

export function ImportPanel() {
  const [state, formAction, pending] = useActionState(importAction, initial);
  const [mode, setMode] = useState<"paste" | "file">("paste");

  return (
    <section className="rounded-[10px] border border-ink-200 bg-white p-6">
      <h2 className="font-display text-2xl font-medium">Import a conversation</h2>
      <p className="mt-1 text-[15px] text-ink-700">
        Paste an email thread or upload a .txt, .md or .eml file. It stays in your private workspace. Nothing is sent anywhere until you ask for an analysis or a draft.
      </p>
      <div role="tablist" aria-label="Import method" className="mt-5 inline-flex rounded-md border border-ink-200 p-1">
        {(["paste", "file"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`rounded px-3 py-1.5 text-sm font-medium ${mode === m ? "bg-ink text-white" : "text-ink-700 hover:bg-ink-100"}`}
          >
            {m === "paste" ? "Paste text" : "Upload file"}
          </button>
        ))}
      </div>
      <form action={formAction} className="mt-5 space-y-4">
        <ErrorNotice message={state.error} />
        <div className="space-y-1">
          <label htmlFor="subject" className="text-sm font-medium">
            Subject <span className="font-normal text-ink-500">(optional)</span>
          </label>
          <input id="subject" name="subject" maxLength={300} className={inputClass} placeholder="e.g. Pilot timing with Northwind" />
        </div>
        {mode === "paste" ? (
          <div className="space-y-1">
            <label htmlFor="thread-text" className="text-sm font-medium">
              Conversation
            </label>
            <textarea
              id="thread-text"
              name="text"
              required
              rows={12}
              maxLength={200000}
              className={`${inputClass} h-auto py-2 font-mono text-[13px] leading-relaxed`}
              placeholder={"Paste the whole thread, including the quoted replies.\n\nOn Thu, 12 Mar 2026, Priya <priya@example.com> wrote:\n> Could you send the revised deck by Friday?"}
            />
          </div>
        ) : (
          <div className="space-y-1">
            <label htmlFor="thread-file" className="text-sm font-medium">
              File
            </label>
            <input id="thread-file" name="file" type="file" required accept=".txt,.md,.eml,text/plain,text/markdown,message/rfc822" className="block w-full text-sm" />
            <p className="text-xs text-ink-500">Up to 750 KB. Attachments in .eml files are ignored.</p>
          </div>
        )}
        <button type="submit" disabled={pending} className={`${buttonClass} sm:w-auto sm:px-6`}>
          {pending ? "Importing…" : "Import conversation"}
        </button>
      </form>
    </section>
  );
}
