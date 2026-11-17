import { Suspense, type ReactNode } from "react";

import { requireRequestContext, type RequestContext } from "@/lib/auth/context";

interface ProtectedPageProps {
  title: string;
  description: string;
  children: (context: RequestContext) => ReactNode;
}

/**
 * Wraps every protected screen. The signed-in user is verified (`auth.getUser()` + workspace
 * membership through RLS) before anything private renders; signed-out visitors are redirected
 * to /login. The check streams behind Suspense as Cache Components requires.
 */
export function ProtectedPage({ title, description, children }: ProtectedPageProps) {
  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      </header>
      <Suspense fallback={<LoadingState />}>
        <Verified>{children}</Verified>
      </Suspense>
    </div>
  );
}

async function Verified({ children }: { children: (context: RequestContext) => ReactNode }) {
  const context = await requireRequestContext();
  return <>{children(context)}</>;
}

export function LoadingState() {
  return (
    <div role="status" aria-live="polite" className="animate-pulse rounded-2xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
      Loading…
    </div>
  );
}

export function EmptyState({ heading, body, milestone }: { heading: string; body: string; milestone: string }) {
  return (
    <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <h2 className="text-base font-semibold text-slate-900">{heading}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">{body}</p>
      <p className="mt-4 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{milestone}</p>
    </section>
  );
}
