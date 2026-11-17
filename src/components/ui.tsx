import Link from "next/link";
import type { ReactNode } from "react";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 font-semibold text-slate-900">
      <span aria-hidden className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-600 text-sm font-bold text-white">
        C
      </span>
      ConvoPilot
    </Link>
  );
}

/** Centered card used by the sign-in, invitation and email-link pages. */
export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-full flex-1 flex-col items-center justify-center bg-slate-50 px-4 py-16">
      <div className="mb-8">
        <Logo />
      </div>
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        <div className="mt-4 space-y-4 text-sm text-slate-600">{children}</div>
      </section>
    </main>
  );
}

export function ErrorNotice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
      {message}
    </p>
  );
}

export const inputClass =
  "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30";

export const buttonClass =
  "inline-flex w-full items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60";
