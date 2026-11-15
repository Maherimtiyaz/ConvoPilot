"use client";

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label } from "@/components/ui/input";

interface CommitmentRecord {
  id: string;
  description: string;
  owner: "me" | "them";
  due_date: string | null;
  status: string;
  confidence: number | null;
  source_excerpt: string | null;
}

interface TaskRecord {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done" | "cancelled";
  priority: "low" | "medium" | "high";
  due_date: string | null;
  origin: "manual" | "proposed";
}

interface TasksPayload {
  tasks: TaskRecord[];
  proposedCommitments: CommitmentRecord[];
  waitingOnOthers: CommitmentRecord[];
}

const PRIORITY_TONE = { high: "danger", medium: "warning", low: "neutral" } as const;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TasksWorkspace({ initialData }: { initialData: TasksPayload }) {
  const [data, setData] = useState<TasksPayload>(initialData);
  const [error, setError] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newDue, setNewDue] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks");
      const body = (await res.json()) as TasksPayload & { error?: { message: string } };
      if (!res.ok) throw new Error(body.error?.message ?? "Failed to load tasks");
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  }, []);

  async function createTask() {
    if (!newTitle.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim(), dueDate: newDue || null }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message: string } };
        throw new Error(body.error?.message ?? "Failed to create task");
      }
      setNewTitle("");
      setNewDue("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function setTaskStatus(task: TaskRecord, status: TaskRecord["status"]) {
    setBusy(true);
    try {
      await fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function commitmentAction(commitment: CommitmentRecord, action: "approve" | "dismiss" | "complete") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/commitments/${commitment.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message: string } };
        throw new Error(body.error?.message ?? "Action failed");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  const tasks = data?.tasks ?? [];
  const open = tasks.filter((t) => t.status === "todo" || t.status === "in_progress");
  const done = tasks.filter((t) => t.status === "done");
  const today = todayIso();

  return (
    <div className="space-y-8">
      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Add a task</CardTitle>
          <CardDescription>Manual tasks are yours alone — agent proposals appear in the approval queue below.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="task-title">Task</Label>
              <Input
                id="task-title"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Send investor update"
                onKeyDown={(e) => e.key === "Enter" && createTask()}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-due">Due date</Label>
              <Input id="task-due" type="date" value={newDue} onChange={(e) => setNewDue(e.target.value)} />
            </div>
            <Button onClick={createTask} disabled={busy || !newTitle.trim()}>
              Add task
            </Button>
          </div>
        </CardContent>
      </Card>

      <section aria-label="Approval queue">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">
          Approval queue — commitments proposed by the agent
        </h2>
        {data?.proposedCommitments.length ? (
          <div className="space-y-3">
            {data.proposedCommitments.map((c) => (
              <Card key={c.id}>
                <CardContent className="space-y-2 pt-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={c.owner === "me" ? "info" : "neutral"}>
                      {c.owner === "me" ? "You promised" : "They promised"}
                    </Badge>
                    {c.due_date ? <Badge tone="warning">due {c.due_date}</Badge> : <Badge>no confirmed date</Badge>}
                    {c.confidence !== null ? <Badge tone={c.confidence >= 0.7 ? "success" : "warning"}>confidence {Math.round(c.confidence * 100)}%</Badge> : null}
                  </div>
                  <p className="text-sm text-zinc-900">{c.description}</p>
                  {c.source_excerpt ? (
                    <blockquote className="border-l-2 border-zinc-300 pl-3 text-xs italic text-zinc-500">
                      “{c.source_excerpt}”
                    </blockquote>
                  ) : null}
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" onClick={() => commitmentAction(c, "approve")} disabled={busy}>
                      {c.owner === "me" ? "Approve (creates task)" : "Approve"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => commitmentAction(c, "dismiss")} disabled={busy}>
                      Dismiss
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            title="No proposals waiting"
            description="When you import a conversation in the Communication Studio, ConvoPilot can extract commitments — they land here for your approval. Nothing becomes a task without you."
          />
        )}
      </section>

      <section aria-label="Open tasks">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Open tasks</h2>
        {open.length ? (
          <div className="space-y-2">
            {open.map((task) => {
              const overdue = task.due_date !== null && task.due_date < today;
              return (
                <div
                  key={task.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3"
                >
                  <Badge tone={PRIORITY_TONE[task.priority]}>{task.priority}</Badge>
                  <span className="flex-1 text-sm text-zinc-900">{task.title}</span>
                  {task.origin === "proposed" ? <Badge tone="info">from conversation</Badge> : null}
                  {task.due_date ? (
                    <Badge tone={overdue ? "danger" : "neutral"}>
                      {overdue ? `overdue — due ${task.due_date}` : `due ${task.due_date}`}
                    </Badge>
                  ) : null}
                  <Button size="sm" variant="outline" onClick={() => setTaskStatus(task, "done")} disabled={busy}>
                    Done
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setTaskStatus(task, "cancelled")} disabled={busy}>
                    Cancel
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState title="No open tasks" description="Add a task above or approve a proposed commitment." />
        )}
      </section>

      <section aria-label="Waiting on others">
        <h2 className="mb-3 text-sm font-semibold text-zinc-900">Waiting on others</h2>
        {data?.waitingOnOthers.length ? (
          <div className="space-y-2">
            {data.waitingOnOthers.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3"
              >
                <span className="flex-1 text-sm text-zinc-900">{c.description}</span>
                {c.due_date ? <Badge tone="neutral">expected {c.due_date}</Badge> : null}
                <Button size="sm" variant="outline" onClick={() => commitmentAction(c, "complete")} disabled={busy}>
                  Mark received
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="Nothing pending from others" description="Commitments other people made to you will appear here once approved." />
        )}
      </section>

      {done.length ? (
        <section aria-label="Completed tasks">
          <h2 className="mb-3 text-sm font-semibold text-zinc-500">Recently completed</h2>
          <div className="space-y-2">
            {done.map((task) => (
              <div key={task.id} className="flex items-center gap-3 rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-2">
                <span className="flex-1 text-sm text-zinc-400 line-through">{task.title}</span>
                <Button size="sm" variant="ghost" onClick={() => setTaskStatus(task, "todo")} disabled={busy}>
                  Reopen
                </Button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
