import { EmptyState } from "@/components/ui/empty-state";

export default function ConversationsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Conversations</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Stored email threads and messages, searchable and linked to contacts.
        </p>
      </header>

      <EmptyState
        title="No conversations yet"
        description="Paste an email thread in the Communication Studio to store your first conversation."
      />
    </div>
  );
}
