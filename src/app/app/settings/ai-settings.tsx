"use client";

import { useActionState, useTransition } from "react";

import type { WritingStyle } from "@/lib/ai/workflows/draft-reply";

import { saveStyleAction, setAiConsentAction, type ActionState } from "../studio/actions";

const field = "block w-full rounded-xl border border-ink-300 bg-white px-3 py-2 text-[15px]";
const initial: ActionState = { error: null };

export function AiConsentToggle({ optIn, configured }: { optIn: boolean; configured: boolean }) {
  const [pending, start] = useTransition();
  return (
    <section className="cp-glass rounded-3xl p-6">
      <h2 className="text-base font-semibold text-ink">AI processing</h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-700">
        When on, the conversations you choose to analyse or reply to are sent to Anthropic (Claude) for processing, only when you press Analyse or Draft. Turning it off stops all AI processing; your conversations stay saved.
      </p>
      {!configured && <p className="mt-2 text-sm text-warning">AI isn&apos;t connected yet on this site.</p>}
      <p className="mt-4 flex items-center gap-3 text-sm">
        <span className={`rounded-full px-2.5 py-0.5 font-mono text-xs ${optIn ? "bg-success-50 text-success" : "bg-ink-100 text-ink-700"}`}>{optIn ? "On" : "Off"}</span>
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => void (await setAiConsentAction(!optIn)))}
          className="h-10 rounded-xl border border-ink-300 bg-white px-4 font-medium hover:bg-ink-100"
        >
          {optIn ? "Turn off AI processing" : "Allow AI processing"}
        </button>
      </p>
    </section>
  );
}

export function StyleForm({ style }: { style: WritingStyle }) {
  const [state, formAction, pending] = useActionState(saveStyleAction, initial);
  return (
    <section className="cp-glass rounded-3xl p-6">
      <h2 className="text-base font-semibold text-ink">Your writing style</h2>
      <p className="mt-1 text-sm text-ink-700">Drafts follow these preferences. Only what you write here is used.</p>
      <form action={formAction} className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-medium sm:col-span-2">
          <span>How you usually sound</span>
          <input name="tone" defaultValue={style.tone} maxLength={200} placeholder="e.g. direct, friendly, no fluff" className={field} />
        </label>
        <label className="space-y-1 text-sm font-medium">
          <span>Greeting</span>
          <input name="greeting" defaultValue={style.greeting} maxLength={100} placeholder="e.g. Hi {first name}," className={field} />
        </label>
        <label className="space-y-1 text-sm font-medium">
          <span>Sign-off</span>
          <input name="signOff" defaultValue={style.signOff} maxLength={100} placeholder="e.g. Best, Ada" className={field} />
        </label>
        <label className="space-y-1 text-sm font-medium sm:col-span-2">
          <span>Things to avoid</span>
          <input name="avoid" defaultValue={style.avoid} maxLength={300} placeholder="e.g. exclamation marks, 'I hope this email finds you well'" className={field} />
        </label>
        <label className="space-y-1 text-sm font-medium sm:col-span-2">
          <span>Other notes</span>
          <textarea name="notes" defaultValue={style.notes} maxLength={1000} rows={2} className={field} />
        </label>
        <label className="space-y-1 text-sm font-medium sm:col-span-2">
          <span>An example of an email you wrote <span className="font-normal text-ink-500">(optional)</span></span>
          <textarea name="sample" defaultValue={style.sample} maxLength={3000} rows={4} className={field} />
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <button type="submit" disabled={pending} className="h-10 rounded-xl bg-ink px-4 text-sm font-semibold text-white hover:bg-ink-700">
            {pending ? "Saving…" : "Save style"}
          </button>
          {state.saved && <span role="status" className="text-sm text-success">Saved</span>}
          {state.error && <span role="alert" className="text-sm text-error">{state.error}</span>}
        </div>
      </form>
    </section>
  );
}
