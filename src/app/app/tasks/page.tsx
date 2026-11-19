import type { Metadata } from "next";
import { Suspense } from "react";

import type { RequestContext } from "@/lib/auth/context";
import { getTimeZone, listTasks, localDays } from "@/lib/services/commitments";

import { EmptyState, LoadingState, ProtectedPage } from "../protected-page";

import { NewTaskForm, TaskList } from "./task-list";

export const metadata: Metadata = { title: "Tasks" };

export default function TasksPage() {
  return (
    <ProtectedPage wide title="Tasks" description="Your follow-ups. Suggestions from your conversations wait here until you approve them.">
      {(ctx) => (
        <Suspense fallback={<LoadingState />}>
          <Tasks ctx={ctx} />
        </Suspense>
      )}
    </ProtectedPage>
  );
}

async function Tasks({ ctx }: { ctx: RequestContext }) {
  const [tasks, timeZone] = await Promise.all([listTasks(ctx), getTimeZone(ctx)]);
  const { today } = localDays(timeZone);
  const proposed = tasks.filter((t) => t.status === "proposed");
  const open = tasks.filter((t) => t.status === "open");
  const closed = tasks.filter((t) => t.status === "done" || t.status === "dismissed").sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")).slice(0, 30);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-6">
        {proposed.length > 0 && (
          <TaskList
            heading="Waiting for your approval"
            description="Suggested from your conversations. Approving also confirms the commitment behind it."
            tasks={proposed}
            today={today}
            tone="proposed"
          />
        )}
        {open.length === 0 && proposed.length === 0 ? (
          <EmptyState
            heading="No tasks yet"
            body="Add one here, or press “Find commitments” on a conversation in Communication Studio. Nothing becomes a task until you approve it."
            milestone="You stay in control of every task"
          />
        ) : (
          <TaskList heading="Open" tasks={open} today={today} tone="open" emptyText="Nothing open. Nice." />
        )}
        {closed.length > 0 && <TaskList heading="Done and dismissed" tasks={closed} today={today} tone="closed" />}
      </div>
      <NewTaskForm />
    </div>
  );
}
