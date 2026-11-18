"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import type { CommitmentView } from "@/lib/services/commitments";

import { approveTaskAction, decideCommitmentAction, extractCommitmentsAction, rejectTaskAction, type Result } from "../tasks/actions";

const small = "inline-flex h-8 items-center rounded-md px-3 text-xs font-semibold disabled:opacity-50";

function due(c: { dueDate: string | null; dueText: string | null }) {
  return c.dueDate ?? c.dueText;
}

/** AI-proposed commitments for one conversation. Only the user's button presses confirm anything. */
export function CommitmentsPanel({ conversationId, commitments, aiReady, onFocus }: { conversationId: string; commitments: CommitmentView[]; aiReady: boolean; onFocus: (position: number) => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const act = (fn: () => Promise<Result>) =>
    start(async () => {
      setError(null);
      setNote(null);
      const r = await fn();
      setError(r.error);
    });

  const visible = commitments.filter((c) => c.status !== "rejected");
  const rejected = commitments.length - visible.length;

  return (
    <section aria-labelledby="commitments-heading" className="rounded-[10px] border border-ink-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="commitments-heading" className="font-display text-2xl font-medium">
          Commitments
        </h3>
        <button
          type="button"
          disabled={!aiReady || pending}
          onClick={() =>
            start(async () => {
              setError(null);
              setNote(null);
              const r = await extractCommitmentsAction(conversationId);
              setError(r.error);
              if (r.summary) {
                const s = r.summary;
                const parts = [s.created === 0 ? "No new commitments found." : `${s.created} new ${s.created === 1 ? "suggestion" : "suggestions"} to review.`];
                if (s.duplicates > 0) parts.push(`${s.duplicates} already listed.`);
                if (s.unsupported > 0) parts.push(`${s.unsupported} left out: no evidence in the messages.`);
                setNote(parts.join(" "));
              }
            })
          }
          className="inline-flex h-10 items-center justify-center rounded-md border border-ink-300 bg-white px-4 text-sm font-medium text-ink hover:bg-ink-100 disabled:opacity-50"
        >
          {pending ? "Working…" : "Find commitments"}
        </button>
      </div>
      <p className="mt-1 text-sm text-ink-700">Promises made in this thread. Suggestions stay unconfirmed until you decide; nothing becomes a task without your approval.</p>

      <div aria-live="polite">
        {error && (
          <p role="alert" className="mt-3 rounded-md border border-error/30 bg-error-50 px-3 py-2 text-sm text-error">
            {error}
          </p>
        )}
        {note && (
          <p role="status" className="mt-3 text-sm text-ink-700">
            {note}
          </p>
        )}
      </div>

      {visible.length === 0 ? (
        <p className="mt-4 text-sm text-ink-500">{commitments.length === 0 ? "None yet." : "No open suggestions."}</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {visible.map((c) => (
            <li key={c.id} data-testid="commitment" className={`rounded-md border p-3 ${c.status === "proposed" ? "border-dashed border-ink-300 bg-paper" : "border-ink-200"}`}>
              <p className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-ink-500">
                <span>{c.owner === "me" ? "You promised" : "They promised"}</span>
                {c.status === "proposed" && <span className="rounded-full bg-marker-100 px-2 py-0.5 text-ink">Suggested · not confirmed</span>}
                {c.status === "confirmed" && <span className="rounded-full bg-success-50 px-2 py-0.5 text-success">Confirmed</span>}
                {c.origin === "inferred" && <span>implied</span>}
                {!c.supported && <span className="text-warning">source deleted</span>}
              </p>
              <p className="mt-1 text-[15px] font-medium">
                {c.description}
                {due(c) && <span className="font-normal text-ink-700"> · due {due(c)}</span>}
                {c.citations.map((cite, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => onFocus(cite.position)}
                    title={cite.quote ? `“${cite.quote}”` : undefined}
                    aria-label={`Source: message ${cite.position}${cite.quote ? `, quote: ${cite.quote}` : ""}`}
                    className="ml-1 rounded-[2px] bg-ink-100 px-1.5 align-baseline font-mono text-[11px] text-route hover:bg-route-50"
                  >
                    [{cite.position}]
                  </button>
                ))}
              </p>
              {c.task && (
                <p className="mt-1 text-sm text-ink-700">
                  Task: {c.task.title}
                  {c.task.status === "open" && (
                    <Link href="/app/tasks" className="ml-2 text-route hover:underline">
                      on your task list
                    </Link>
                  )}
                  {c.task.status === "proposed" && <span className="ml-2 text-ink-500">(waiting for your approval)</span>}
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {c.status === "proposed" && c.supported && c.task?.status === "proposed" && (
                  <button type="button" disabled={pending} onClick={() => act(() => approveTaskAction(c.task!.id, true))} className={`${small} bg-ink text-white hover:bg-ink-700`}>
                    Confirm and add task
                  </button>
                )}
                {c.status === "proposed" && c.supported && (
                  <button type="button" disabled={pending} onClick={() => act(() => decideCommitmentAction(c.id, "confirm"))} className={`${small} border border-ink-300 bg-white hover:bg-ink-100`}>
                    {c.task?.status === "proposed" ? "Confirm only" : "Confirm"}
                  </button>
                )}
                {c.status === "proposed" && (
                  <button type="button" disabled={pending} onClick={() => act(() => decideCommitmentAction(c.id, "reject"))} className={`${small} border border-ink-300 bg-white hover:bg-ink-100`}>
                    Not a commitment
                  </button>
                )}
                {c.status === "confirmed" && c.supported && c.task?.status === "proposed" && (
                  <>
                    <button type="button" disabled={pending} onClick={() => act(() => approveTaskAction(c.task!.id, false))} className={`${small} bg-ink text-white hover:bg-ink-700`}>
                      Add task
                    </button>
                    <button type="button" disabled={pending} onClick={() => act(() => rejectTaskAction(c.task!.id))} className={`${small} border border-ink-300 bg-white hover:bg-ink-100`}>
                      No task needed
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {rejected > 0 && <p className="mt-3 font-mono text-xs text-ink-500">{rejected} dismissed {rejected === 1 ? "suggestion" : "suggestions"} hidden</p>}
    </section>
  );
}
