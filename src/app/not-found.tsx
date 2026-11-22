import Link from "next/link";

import { AuroraBackground, Logo } from "@/components/ui";

/** Branded "page not found" (also shown by notFound()). Next.js adds a noindex tag. */
export default function NotFound() {
  return (
    <main className="relative flex min-h-full flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <AuroraBackground />
      <div className="cp-rise">
        <Logo />
      </div>
      <p className="cp-rise cp-d1 mt-10 font-mono text-sm text-ink-500">404</p>
      <h1 className="cp-rise cp-d2 mt-2 font-display text-4xl tracking-tight text-ink sm:text-5xl">
        This page <span className="cp-aurora-text font-serif italic">slipped.</span>
      </h1>
      <p className="cp-rise cp-d3 mt-4 max-w-md text-ink-700">The link may be old or mistyped. Nothing important is lost.</p>
      <div className="cp-rise cp-d4 mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/" className="rounded-full bg-ink px-6 py-3 text-[15px] font-semibold text-white transition hover:-translate-y-0.5">
          Go to the home page
        </Link>
        <Link href="/app" className="cp-glass rounded-full px-6 py-3 text-[15px] font-semibold text-ink transition hover:-translate-y-0.5">
          Open the app
        </Link>
      </div>
    </main>
  );
}
