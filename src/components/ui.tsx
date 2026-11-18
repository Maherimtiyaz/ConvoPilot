import Link from "next/link";
import type { ReactNode } from "react";

/** Brand logo from public/brand (docs/BRAND.md §5.4). `tone="dark"` is for Ink backgrounds. */
export function Logo({ tone = "light", className = "h-7 w-auto" }: { tone?: "light" | "dark"; className?: string }) {
  const src = tone === "dark" ? "/brand/logo-horizontal-on-dark.svg" : "/brand/logo-horizontal.svg";
  return (
    <Link href="/" className="inline-flex shrink-0" aria-label="ConvoPilot home">
      {/* Plain <img>: a static SVG needs no optimisation. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="ConvoPilot" width={656} height={107} className={className} />
    </Link>
  );
}

/** Centered card used by the sign-in, invitation and email-link pages. */
export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center bg-paper px-4 py-16">
      <div className="mb-10">
        <Logo />
      </div>
      <section className="w-full max-w-md rounded-[10px] border border-ink-200 bg-white p-8 shadow-[0_4px_12px_rgba(14,27,44,0.08)]">
        <h1 className="font-display text-3xl font-medium tracking-tight text-ink">{title}</h1>
        <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-ink-700">{children}</div>
      </section>
      <p className="mt-8 font-mono text-xs text-ink-500">Private by design · nothing is ever sent for you</p>
    </main>
  );
}

export function ErrorNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md border border-error/30 bg-error-50 px-3 py-2 text-sm text-error">
      {message}
    </p>
  );
}

export const inputClass =
  "block h-11 w-full rounded-md border border-ink-300 bg-white px-3 text-[15px] text-ink placeholder:text-ink-500 transition-shadow duration-150 ease-brand focus:border-route focus:outline-none focus:ring-2 focus:ring-route/25";

export const buttonClass =
  "inline-flex h-11 w-full items-center justify-center rounded-md bg-ink px-4 text-[15px] font-semibold text-white transition duration-150 ease-brand hover:bg-ink-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60";

export const secondaryButtonClass =
  "inline-flex h-11 items-center justify-center rounded-md border border-ink-300 bg-white px-4 text-[15px] font-medium text-ink transition duration-150 ease-brand hover:bg-ink-100";
