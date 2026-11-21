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
        <h1 className="cp-rise font-display text-4xl text-ink sm:text-[2.75rem]">{title}</h1>
        <p className="cp-rise cp-d1 mt-2 text-[15px] text-ink-700">{description}</p>
      </header>
      <Suspense fallback={<LoadingState />}>
        <div className="cp-rise cp-d2">
          <Verified>{children}</Verified>
        </div>
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
    <div role="status" aria-live="polite" className="cp-glass space-y-4 rounded-3xl p-8">
      <span className="sr-only">Loading…</span>
      <div className="cp-shimmer h-5 w-1/3 rounded-full" aria-hidden="true" />
      <div className="cp-shimmer h-4 w-full rounded-full" aria-hidden="true" />
      <div className="cp-shimmer h-4 w-5/6 rounded-full" aria-hidden="true" />
      <div className="cp-shimmer h-4 w-2/3 rounded-full" aria-hidden="true" />
    </div>
  );
}

export function EmptyState({ heading, body, milestone }: { heading: string; body: string; milestone: string }) {
  return (
    <section className="cp-glass rounded-3xl px-6 py-14 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/pattern-quotes-ink.svg" alt="" width={60} height={40} className="mx-auto h-8 w-auto opacity-20" />
      <h2 className="mt-4 font-display text-2xl text-ink">{heading}</h2>
      <p className="mx-auto mt-2 max-w-md text-[15px] leading-relaxed text-ink-700">{body}</p>
      <p className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/80 px-3.5 py-1.5 text-xs font-medium text-ink-700">
        <span className="cp-chisel" aria-hidden="true" />
        {milestone}
      </p>
    </section>
  );
}
