import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Logo } from "@/components/ui";

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

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col bg-paper text-ink">
      <header className="sticky top-0 z-20 border-b border-ink-200/70 bg-paper/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <Logo className="h-5 w-auto sm:h-7" />
          <nav className="flex items-center gap-3 whitespace-nowrap text-sm font-medium sm:gap-5">
            <a href="#how-it-works" className="hidden text-ink-700 hover:text-ink sm:inline">How it works</a>
            <a href="#faq" className="hidden text-ink-700 hover:text-ink sm:inline">FAQ</a>
            <Link href="/login" className="text-ink-700 hover:text-ink">Sign in</Link>
            <a href="#waitlist" className="rounded-md bg-ink px-3 py-2 text-white transition hover:bg-ink-700 sm:px-3.5"><span className="sm:hidden">Early access</span><span className="hidden sm:inline">Get early access</span></a>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl gap-12 px-4 pb-20 pt-16 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:pt-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-[2px] border border-ink-200 bg-white px-2.5 py-1 font-mono text-xs uppercase tracking-wider text-ink-700">
              <span className="cp-chisel" aria-hidden="true" /> Invite-only early access
            </p>
            <h1 className="mt-6 font-display text-[clamp(3.25rem,8vw,6rem)] font-medium leading-[0.95] tracking-[-0.035em] text-balance">
              Nothing important <span className="cp-highlight cp-highlight-sweep">slips.</span>
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-ink-700 sm:text-xl">
              ConvoPilot is the AI chief of staff for your conversations. It quotes what people need from you, drafts the reply in your own voice, and tracks what you promised. Nothing happens without your approval.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a href="#waitlist" className="rounded-md bg-ink px-5 py-3 text-[15px] font-semibold text-white transition hover:bg-ink-700">Request early access</a>
              <a href="#how-it-works" className="rounded-md border border-ink-300 bg-white px-5 py-3 text-[15px] font-semibold text-ink transition hover:bg-ink-100">See how it works</a>
            </div>
          </div>
          <div className="relative hidden aspect-[4/3] items-center sm:flex justify-center overflow-hidden rounded-2xl bg-ink">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/symbol.svg" alt="" width={72} height={44} className="w-2/3 max-w-sm motion-safe:animate-[cp-rise_700ms_cubic-bezier(0.2,0.7,0.2,1)_both]" />
            <p className="absolute bottom-6 left-0 right-0 text-center font-display text-lg text-ink-300">Two voices, quoted. The line that matters, highlighted.</p>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-20 border-t border-ink-200 bg-white py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <p className="font-mono text-xs uppercase tracking-wider text-ink-500">From a thread to a kept promise</p>
            <h2 className="mt-3 font-display text-4xl font-medium tracking-tight sm:text-5xl">How it works</h2>
            <div className="mt-12">
              <ProductDemo />
            </div>
            <div className="mt-16 grid gap-4 sm:grid-cols-3">
              {pillars.map((p, i) => (
                <div key={p.title} className="rounded-[10px] border border-ink-200 bg-paper p-6">
                  <span className="font-mono text-xs text-ink-500">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="mt-2 font-display text-2xl font-medium">{p.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-700">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-ink-200 py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <h2 className="font-display text-4xl font-medium tracking-tight sm:text-5xl">Built on trust</h2>
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {principles.map((p) => (
                <div key={p.title} className="rounded-[10px] border border-ink-200 bg-white p-6">
                  <h3 className="flex items-center gap-2.5 font-semibold"><span className="cp-chisel" aria-hidden="true" />{p.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-700">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="waitlist" className="scroll-mt-20 bg-ink py-20 text-white">
          <div className="mx-auto max-w-2xl px-4 sm:px-6">
            <h2 className="text-center font-display text-4xl font-medium tracking-tight sm:text-5xl">Request early access</h2>
            <p className="mt-4 text-center text-ink-300">
              We&apos;re opening ConvoPilot to small groups. Tell us a little about you and we&apos;ll be in touch.
            </p>
            <div className="mt-10 rounded-2xl bg-white p-6 text-ink shadow-[0_12px_32px_rgba(0,0,0,0.25)] sm:p-8">
              <Suspense fallback={<p className="text-sm text-ink-500">Loading form…</p>}>
                <WaitlistForm />
              </Suspense>
            </div>
          </div>
        </section>

        <section id="faq" className="scroll-mt-20 py-20">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <h2 className="font-display text-4xl font-medium tracking-tight sm:text-5xl">Questions</h2>
            <dl className="mt-10 divide-y divide-ink-200 border-y border-ink-200">
              {faqs.map((f) => (
                <div key={f.q} className="py-6">
                  <dt className="font-semibold">{f.q}</dt>
                  <dd className="mt-2 text-[15px] leading-relaxed text-ink-700">{f.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>

      <footer className="border-t border-ink-200 py-10">
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
