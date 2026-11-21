import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AuroraBackground, Logo } from "@/components/ui";

import { ProductDemo } from "./product-demo";
import { WaitlistForm } from "./waitlist-form";

export const metadata: Metadata = {
  title: "ConvoPilot — Nothing important slips",
  description:
    "The AI chief of staff for your conversations. It quotes what matters, drafts replies in your voice and tracks your commitments, with your approval. Request early access.",
};

const pillars = [
  { title: "Understand", body: "What they want and what they expect from you, each point quoted from the thread." },
  { title: "Reply", body: "A draft that sounds like you, not a template. Edit, save or copy it." },
  { title: "Follow through", body: "Commitments and tasks proposed for your approval, tracked until they're done." },
];

const principles = [
  { title: "You approve everything", body: "The AI drafts and suggests. Only you decide what becomes a fact, a task or a message." },
  { title: "Evidence, not guesses", body: "Answers cite the message they came from, or say plainly that there's no record." },
  { title: "Your data stays yours", body: "Each account is a private workspace. Other users can never see or change your data." },
  { title: "Nothing is sent for you", body: "The first version has no ability to send email or messages at all." },
];

const faqs = [
  { q: "Who is ConvoPilot for?", a: "Founders and operators at small companies who handle lots of important conversations with investors, customers, hires and partners, and want fewer dropped follow-ups." },
  { q: "Does it read my inbox?", a: "Not in the first version. You choose exactly which conversations to paste or upload. Inbox and calendar connections will come later, and only if you turn them on." },
  { q: "When can I start?", a: "We're inviting people in small groups so we can listen closely to feedback. Join the waitlist and we'll email you a personal invitation when it's your turn." },
  { q: "How much does it cost?", a: "Early access is free while we learn what helps most. We'll tell you well in advance before anything changes." },
];

const pill = "inline-flex items-center gap-2 rounded-full";

export default function LandingPage() {
  return (
    <div className="relative flex flex-1 flex-col text-ink">
      <AuroraBackground />

      <header className="sticky top-0 z-30 px-3 pt-3 sm:px-6">
        <div className="cp-glass mx-auto flex w-full max-w-6xl items-center justify-between gap-3 rounded-full py-2 pl-5 pr-2">
          <Logo className="h-5 w-auto sm:h-6" />
          <nav className="flex items-center gap-1 whitespace-nowrap text-sm font-medium">
            <a href="#how-it-works" className="hidden rounded-full px-3.5 py-2 text-ink-700 transition hover:bg-white/70 hover:text-ink sm:inline">How it works</a>
            <a href="#faq" className="hidden rounded-full px-3.5 py-2 text-ink-700 transition hover:bg-white/70 hover:text-ink sm:inline">FAQ</a>
            <Link href="/login" className="rounded-full px-3.5 py-2 text-ink-700 transition hover:bg-white/70 hover:text-ink">Sign in</Link>
            <a href="#waitlist" className="rounded-full bg-ink px-4 py-2.5 text-white shadow-[0_8px_20px_-10px_rgba(23,21,31,0.6)] transition hover:-translate-y-px hover:bg-ink-700">
              <span className="sm:hidden">Early access</span>
              <span className="hidden sm:inline">Get early access</span>
            </a>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-20 text-center sm:px-6 sm:pt-28">
          <p className={`${pill} cp-glass cp-rise px-4 py-2 text-sm text-ink-700`}>
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="cp-ring absolute inline-flex h-full w-full rounded-full bg-[#7B5CFF]" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#7B5CFF]" />
            </span>
            Invite-only early access · inviting founders in small groups
          </p>
          <h1 className="cp-rise cp-d1 mx-auto mt-8 max-w-4xl font-display text-[clamp(3.2rem,8.5vw,6.5rem)] leading-[0.98] text-balance">
            Nothing important <span className="cp-aurora-text">slips.</span>
          </h1>
          <p className="cp-rise cp-d2 mx-auto mt-7 max-w-2xl text-lg leading-relaxed text-ink-700 sm:text-xl">
            ConvoPilot is the AI chief of staff for your conversations. It quotes what people need from you, drafts the reply in your own voice, and tracks what you promised. Nothing happens without your approval.
          </p>
          <div className="cp-rise cp-d3 mt-10 flex flex-wrap justify-center gap-3">
            <a href="#waitlist" className={`${pill} group bg-ink px-6 py-3.5 text-[15px] font-semibold text-white shadow-[0_14px_30px_-12px_rgba(23,21,31,0.6)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_36px_-14px_rgba(91,63,224,0.6)]`}>
              Request early access <span className="cp-arrow" aria-hidden="true">→</span>
            </a>
            <a href="#how-it-works" className={`${pill} cp-glass px-6 py-3.5 text-[15px] font-semibold text-ink transition hover:-translate-y-0.5`}>
              See how it works
            </a>
          </div>
          <ul className="cp-rise cp-d4 mt-8 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-ink-500">
            {["Private workspace", "Nothing sent for you", "Every answer cited"].map((t) => (
              <li key={t} className="inline-flex items-center gap-2">
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                  <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="#5B3FE0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {t}
              </li>
            ))}
          </ul>

          {/* Hero preview: what the product does, at a glance (sample content). */}
          <div className="cp-rise cp-d5 relative mx-auto mt-16 max-w-4xl" aria-hidden="true">
            <div className="cp-float cp-glass-strong grid gap-4 rounded-[28px] p-4 text-left sm:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] sm:p-5">
              <div className="rounded-2xl bg-white/80 p-5">
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-[#C9B6FF] to-[#FFC6A8] text-sm font-semibold text-ink">PS</span>
                  <span>
                    <span className="block text-sm font-semibold">Priya Shah</span>
                    <span className="block text-xs text-ink-500">Thu 09:14 · sample</span>
                  </span>
                </div>
                <p className="mt-4 text-[15px] leading-relaxed text-ink-700">
                  Thanks for the call today. Could you <span className="cp-highlight cp-highlight-sweep text-ink">send the revised deck by Friday</span>? We&apos;d also like to know if the pilot can start in March.
                </p>
                <p className="mt-4 inline-flex rounded-full bg-ink-100 px-3 py-1 font-mono text-[11px] text-ink-700">↳ cited · message 1</p>
              </div>
              <div className="flex flex-col gap-3">
                <div className="rounded-2xl bg-ink p-5 text-white">
                  <p className="text-xs font-semibold uppercase tracking-wider"><span className="cp-aurora-text">Suggested commitment</span></p>
                  <p className="mt-2 font-semibold">Send Priya the revised deck</p>
                  <p className="mt-0.5 text-sm text-white/60">Due Friday · from message 1</p>
                  <div className="mt-4 flex gap-2">
                    <span className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink">Approve</span>
                    <span className="rounded-full border border-white/25 px-4 py-2 text-sm">Not now</span>
                  </div>
                </div>
                <div className="rounded-2xl bg-white/80 p-5">
                  <p className="flex justify-between text-xs text-ink-500"><span>Draft · your voice</span><span>Not sent</span></p>
                  <p className="mt-2 text-sm leading-relaxed text-ink-700">Hi Priya, yes, you&apos;ll have the revised deck by Friday, and March works for the pilot.</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-24 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="text-center">
              <p className="text-sm font-medium text-route">From a thread to a kept promise</p>
              <h2 className="mt-3 font-display text-4xl sm:text-5xl">How it works</h2>
            </div>
            <div className="mt-14">
              <ProductDemo />
            </div>
            <div className="mt-16 grid gap-4 sm:grid-cols-3">
              {pillars.map((p, i) => (
                <div key={p.title} className="cp-glass cp-lift rounded-3xl p-7">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#C9B6FF] to-[#FFC6A8] font-mono text-xs font-semibold text-ink">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="mt-5 font-display text-2xl">{p.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-700">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="text-center font-display text-4xl sm:text-5xl">Built on trust</h2>
            <div className="mt-12 grid gap-4 sm:grid-cols-2">
              {principles.map((p) => (
                <div key={p.title} className="cp-glass cp-lift rounded-3xl p-7">
                  <h3 className="flex items-center gap-3 text-lg font-semibold">
                    <span className="cp-chisel" aria-hidden="true" />
                    {p.title}
                  </h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-700">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="waitlist" className="scroll-mt-24 py-20">
          <div className="mx-auto max-w-2xl px-4 sm:px-6">
            <h2 className="text-center font-display text-4xl sm:text-5xl">Request early access</h2>
            <p className="mx-auto mt-4 max-w-lg text-center text-ink-700">
              We&apos;re opening ConvoPilot to small groups. Tell us a little about you and we&apos;ll be in touch.
            </p>
            <div className="cp-glass-strong relative mt-10 rounded-[28px] p-6 sm:p-9">
              <Suspense fallback={<p className="text-sm text-ink-500">Loading form…</p>}>
                <WaitlistForm />
              </Suspense>
            </div>
          </div>
        </section>

        <section id="faq" className="scroll-mt-24 py-20">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <h2 className="text-center font-display text-4xl sm:text-5xl">Questions</h2>
            <div className="mt-10 space-y-3">
              {faqs.map((f) => (
                <details key={f.q} className="cp-glass group rounded-2xl px-6 py-5">
                  <summary className="flex items-center justify-between gap-4 font-semibold">
                    {f.q}
                    <span className="cp-plus grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink-100 text-ink" aria-hidden="true">+</span>
                  </summary>
                  <p className="cp-answer mt-3 text-[15px] leading-relaxed text-ink-700">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="py-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 text-sm text-ink-500 sm:px-6">
          <span className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/symbol.svg" alt="" width={72} height={44} className="h-4 w-auto" />
            © 2026 ConvoPilot
          </span>
          <nav className="flex gap-5">
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <Link href="/login" className="hover:text-ink">Sign in</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
