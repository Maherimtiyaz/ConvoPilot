import { EmptyState } from "@/components/ui/empty-state";

export default function StudioPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Communication Studio</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Paste an email or thread, and ConvoPilot will analyze it and draft a professional reply for your review.
        </p>
      </header>

      <EmptyState
        title="Communication Studio arrives in Phase 2"
        description="Email import, intent analysis, and reply generation are the next milestone. The foundation (auth, database, workspace) is in place underneath this screen."
      />
    </div>
  );
}
