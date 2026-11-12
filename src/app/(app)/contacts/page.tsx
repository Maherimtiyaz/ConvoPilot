import { EmptyState } from "@/components/ui/empty-state";

export default function ContactsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Contacts</h1>
        <p className="mt-1 text-sm text-zinc-500">
          People you communicate with, their context, and your relationship history.
        </p>
      </header>

      <EmptyState
        title="No contacts yet"
        description="Contacts are created when you save a sender from the Communication Studio, or manually in Phase 3."
      />
    </div>
  );
}
