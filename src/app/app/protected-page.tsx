import { Suspense, type ReactNode } from "react";

import { requireRequestContext, type RequestContext } from "@/lib/auth/context";

interface ProtectedPageProps {
  /** Wide pages (e.g. the Studio's three-column layout) use more of the screen. */
  wide?: boolean;
  title: string;
  description: string;
  children: (context: RequestContext) => ReactNode;
}

/**
 * Wraps every protected screen. The signed-in user is verified (`auth.getUser()` + workspace
 * membership through RLS) before anything private renders; signed-out visitors are redirected
 * to /login. The check streams behind Suspense as Cache Components requires.
 */
export function ProtectedPage({ title, description, children, wide = false }: ProtectedPageProps) {
  return (
    <div className={`mx-auto ${wide ? "max-w-7xl" : "max-w-4xl"}`}>
      <header className="mb-8">
        <h1 className="font-display text-4xl font-medium tracking-tight text-ink">{title}</h1>
        <p className="mt-1 text-sm text-ink-700">{description}</p>
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
    <div role="status" aria-live="polite" className="animate-pulse rounded-[10px] border border-ink-200 bg-white p-8 text-sm text-ink-500">
      Loading…
    </div>
  );
}

export function EmptyState({ heading, body, milestone }: { heading: string; body: string; milestone: string }) {
  return (
    <section className="rounded-2xl border border-dashed border-ink-300 bg-white px-6 py-12 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/pattern-quotes-ink.svg" alt="" width={60} height={40} className="mx-auto h-8 w-auto opacity-20" />
      <h2 className="mt-4 font-display text-2xl font-medium text-ink">{heading}</h2>
      <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-ink-700">{body}</p>
      <p className="mt-5 inline-flex items-center gap-2 rounded-[2px] bg-ink-100 px-2.5 py-1 font-mono text-xs text-ink-700">
        <span className="cp-chisel" aria-hidden="true" />
        {milestone}
      </p>
    </section>
  );
}
