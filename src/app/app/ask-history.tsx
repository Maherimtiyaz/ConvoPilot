"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { askAction, type AskResult } from "./contacts/actions";

/** "Ask your history": a cited answer from the user's own conversations, or "no record". */
export function AskHistory({ defaultQuestion = "", heading = "Ask your history" }: { defaultQuestion?: string; heading?: string }) {
  const [question, setQuestion] = useState(defaultQuestion);
  const [result, setResult] = useState<AskResult | null>(null);
  const [pending, start] = useTransition();

  return (
    <section aria-labelledby="ask-heading" className="cp-glass rounded-3xl p-5">
      <h2 id="ask-heading" className="font-display text-2xl font-medium">
        {heading}
      </h2>
      <p className="mt-1 text-sm text-ink-700">Answers come only from your imported conversations, with the messages they came from.</p>
      <form
        className="mt-4 flex flex-col gap-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => setResult(await askAction(question)));
        }}
      >
        <label htmlFor="ask-question" className="sr-only">
          Your question
        </label>
        <input
          id="ask-question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={500}
          placeholder="e.g. What did I discuss with Priya?"
          className="h-11 min-w-0 flex-1 rounded-xl border border-ink-300 px-3 text-[15px]"
        />
        <button type="submit" disabled={pending || question.trim().length < 3} className="h-11 rounded-xl bg-ink px-5 text-sm font-semibold text-white hover:bg-ink-700 disabled:opacity-50">
          {pending ? "Looking…" : "Ask"}
        </button>
      </form>
      <div aria-live="polite" className="mt-4">
        {result?.status === "answered" && (
          <div className="space-y-3">
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{result.answer}</p>
            <ul className="space-y-2">
              {result.citations.map((c, i) => (
                <li key={i} className="rounded-md bg-ink-100 px-3 py-2 text-sm">
                  <Link href={`/app/studio?c=${c.conversationId}#message-${c.position}`} className="font-medium text-route hover:underline">
                    {c.subject} · message [{c.position}]
                  </Link>
                  <span className="text-ink-500">
                    {c.senderName ? ` · ${c.senderName}` : ""}
                    {c.sentAt ? ` · ${c.sentAt.slice(0, 10)}` : ""}
                  </span>
                  {c.quote && <span className="mt-1 block font-mono text-xs text-ink-700">“{c.quote}”</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {result?.status === "no_record" && <p className="text-[15px] text-ink-700">No record of that in your conversations.</p>}
        {result?.status === "incomplete" && <p className="text-[15px] text-ink-700">That needed more digging than one question allows. Try asking something more specific.</p>}
        {result?.status === "error" && (
          <p role="alert" className="rounded-xl border border-error/30 bg-error-50 px-3 py-2 text-sm text-error">
            {result.message}
          </p>
        )}
      </div>
    </section>
  );
}
