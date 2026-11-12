import { EmptyState } from "@/components/ui/empty-state";

export default function TasksPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Tasks & Follow-ups</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Commitments, follow-ups, and action items — including proposals from the agent awaiting your approval.
        </p>
      </header>

      <EmptyState
        title="No tasks yet"
        description="Create tasks manually in Phase 4, or let ConvoPilot propose them from imported conversations."
      />
    </div>
  );
}
