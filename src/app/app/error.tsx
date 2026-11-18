"use client";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <section role="alert" className="mx-auto max-w-xl rounded-2xl border border-error/30 bg-white p-8">
      <h1 className="text-lg font-semibold text-ink">Something went wrong</h1>
      <p className="mt-2 text-sm text-ink-700">Please try again. If it keeps happening, sign out and back in.</p>
      <button type="button" onClick={reset} className="mt-4 rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white">
        Try again
      </button>
    </section>
  );
}
