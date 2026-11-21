"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";

import type { TaskView } from "@/lib/services/commitments";

import { approveTaskAction, createTaskAction, rejectTaskAction, setTaskStatusAction, type Result } from "./actions";

const small = "inline-flex h-9 items-center rounded-full px-3.5 text-xs font-semibold transition duration-200 ease-brand hover:-translate-y-px active:scale-[0.96] disabled:opacity-50";
const quiet = `${small} border border-ink-200 bg-white/80 hover:bg-white`;
const strong = `${small} bg-ink text-white hover:bg-ink-700`;
const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function Due({ task, today }: { task: TaskView; today: string }) {
  if (task.dueDate) {
    const overdue = task.status === "open" && task.dueDate < today;
    return <span className={overdue ? "font-semibold text-error" : ""}>{overdue ? "overdue · " : "due "}{dateFormat.format(new Date(`${task.dueDate}T00:00:00Z`))}</span>;
  }
  return task.dueText ? <span>due {task.dueText} (no date set)</span> : null;
}

export function TaskList({ heading, description, tasks, today, tone, emptyText }: { heading: string; description?: string; tasks: TaskView[]; today: string; tone: "proposed" | "open" | "closed"; emptyText?: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const act = (fn: () => Promise<Result>) =>
    start(async () => {
      setError(null);
      setError((await fn()).error);
    });
  const id = `tasks-${tone}`;

  return (
    <section aria-labelledby={id} className={`rounded-[10px] border bg-white p-5 ${tone === "proposed" ? "border-marker" : "border-ink-200"}`}>
      <h2 id={id} className="font-semibold">
        {heading} <span className="font-mono text-xs text-ink-500">{tasks.length}</span>
      </h2>
      {description && <p className="mt-1 text-sm text-ink-700">{description}</p>}
      {error && (
        <p role="alert" className="mt-3 rounded-xl border border-error/30 bg-error-50 px-3 py-2 text-sm text-error">
          {error}
        </p>
      )}
      {tasks.length === 0 ? (
        <p className="mt-3 text-sm text-ink-500">{emptyText}</p>
      ) : (
        <ul className="mt-3 divide-y divide-ink-200">
          {tasks.map((t) => (
            <li key={t.id} data-testid="task" className="cp-rise flex flex-wrap items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className={`font-medium ${tone === "closed" ? "text-ink-500" : ""}`}>
                  {t.priority === "high" && <span className="mr-2 rounded-full bg-error-50 px-2 py-0.5 font-mono text-[11px] text-error no-underline">high</span>}
                  <span className={tone === "closed" ? "cp-strike" : ""}>{t.title}</span>
                </p>
                <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-ink-500 [&>*+*]:before:mr-2 [&>*+*]:before:content-['·']">
                  {(t.dueDate || t.dueText) && <Due task={t} today={today} />}
                  {t.contactName && <span>{t.contactName}</span>}
                  {t.conversationId && t.conversationSubject && (
                    <Link href={`/app/studio?c=${t.conversationId}`} className="text-route hover:underline">
                      {t.conversationSubject}
                    </Link>
                  )}
                  {t.fromAi && <span>from a conversation</span>}
                  {t.status === "dismissed" && <span>dismissed</span>}
                </p>
                {tone === "proposed" && t.commitment && <p className="mt-1 text-sm text-ink-700">Commitment: {t.commitment.description}</p>}
                {t.needsReview && <p className="mt-1 text-xs font-medium text-warning">Check this: its source was deleted or the commitment was rejected.</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {tone === "proposed" && (
                  <>
                    <button type="button" disabled={pending} onClick={() => act(() => approveTaskAction(t.id, true))} className={strong} aria-label={`Approve: ${t.title}`}>
                      Approve
                    </button>
                    <button type="button" disabled={pending} onClick={() => act(() => rejectTaskAction(t.id))} className={quiet} aria-label={`Reject: ${t.title}`}>
                      Reject
                    </button>
                  </>
                )}
                {tone === "open" && (
                  <>
                    <button type="button" disabled={pending} onClick={() => act(() => setTaskStatusAction(t.id, "done"))} className={strong} aria-label={`Mark done: ${t.title}`}>
                      Done
                    </button>
                    <button type="button" disabled={pending} onClick={() => act(() => setTaskStatusAction(t.id, "dismissed"))} className={quiet} aria-label={`Dismiss: ${t.title}`}>
                      Dismiss
                    </button>
                  </>
                )}
                {tone === "closed" && (
                  <button type="button" disabled={pending} onClick={() => act(() => setTaskStatusAction(t.id, "open"))} className={quiet} aria-label={`Reopen: ${t.title}`}>
                    Reopen
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const field = "block h-10 w-full rounded-xl border border-ink-300 bg-white px-3 text-[15px]";

export function NewTaskForm() {
  const [state, action, pending] = useActionState(createTaskAction, { error: null });
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state.saved) form.current?.reset();
  }, [state.saved]);
  return (
    <section className="h-fit cp-glass rounded-3xl p-5">
      <h2 className="font-semibold">Add a task</h2>
      <form ref={form} action={action} className="mt-3 space-y-3">
        {state.error && (
          <p role="alert" className="rounded-xl border border-error/30 bg-error-50 px-3 py-2 text-sm text-error">
            {state.error}
          </p>
        )}
        <label className="block space-y-1 text-sm font-medium">
          <span>Task</span>
          <input name="title" required maxLength={200} className={field} />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          <span>Due date (optional)</span>
          <input name="dueDate" type="date" className={field} />
        </label>
        <label className="block space-y-1 text-sm font-medium">
          <span>Priority</span>
          <select name="priority" defaultValue="normal" className={field}>
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
          </select>
        </label>
        <button type="submit" disabled={pending} className="h-10 w-full rounded-xl bg-ink text-sm font-semibold text-white hover:bg-ink-700">
          {pending ? "Adding…" : "Add task"}
        </button>
      </form>
    </section>
  );
}
