import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Logo } from "@/components/ui";

import { WaitlistForm } from "./waitlist-form";

export const metadata: Metadata = {
  title: "ConvoPilot — your AI chief of staff for conversations",
  description:
    "ConvoPilot turns your professional conversations into clear replies, commitments and follow-ups. Request early access.",
};

const steps = [
  { title: "Paste a conversation", body: "Drop in an email thread or upload a .txt, .md or .eml file. No inbox access needed." },
  { title: "Understand it in seconds", body: "See what the other person wants, the key points and what they expect from you — each linked to the exact message." },
  { title: "Reply in your own voice", body: "Get a draft that sounds like you, not a corporate template. Edit, save or copy it. ConvoPilot never sends anything for you." },
  { title: "Never drop a follow-up", body: "ConvoPilot proposes the commitments and tasks it spots. Nothing becomes a task until you approve it." },
];

const principles = [
  { title: "You approve everything", body: "The AI drafts and suggests. Only you decide what becomes a fact, a task or a message." },
  { title: "Evidence, not guesses", body: "Answers cite the conversation they came from — or say plainly that there's no record." },
  { title: "Your data stays yours", body: "Each account is a private workspace. Other users can never see or change your data." },
  { title: "Nothing is sent for you", body: "The first version has no ability to send email or messages at all." },
];

const faqs = [
  { q: "Who is ConvoPilot for?", a: "Founders and operators at small companies who handle lots of important conversations — investors, customers, hires, partners — and want fewer dropped follow-ups." },
  { q: "Does it read my inbox?", a: "Not in the first version. You choose exactly which conversations to paste or upload. Inbox and calendar connections will come later, and only if you turn them on." },
  { q: "When can I start?", a: "We're inviting people in small groups so we can listen closely to feedback. Join the waitlist and we'll email you a personal invitation when it's your turn." },
  { q: "How much does it cost?", a: "Early access is free while we learn what helps most. We'll tell you well in advance before anything changes." },
];

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col bg-white text-slate-900">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <nav className="flex items-center gap-4 text-sm font-medium">
          <a href="#how-it-works" className="hidden text-slate-600 hover:text-slate-900 sm:inline">How it works</a>
          <a href="#faq" className="hidden text-slate-600 hover:text-slate-900 sm:inline">FAQ</a>
          <Link href="/login" className="text-slate-600 hover:text-slate-900">Sign in</Link>
          <a href="#waitlist" className="rounded-lg bg-indigo-600 px-3 py-2 text-white hover:bg-indigo-500">Get early access</a>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-4xl px-6 pt-16 pb-20 text-center">
          <p className="inline-block rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">Invite-only early access</p>
          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
            Your AI chief of staff for every important conversation
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-600">
            ConvoPilot turns your email threads into clear replies, commitments and follow-ups — in your own voice, with
            evidence for everything, and nothing sent without you.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <a href="#waitlist" className="rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white hover:bg-indigo-500">Request early access</a>
            <a href="#how-it-works" className="rounded-lg border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50">See how it works</a>
          </div>
        </section>

        <section id="how-it-works" className="bg-slate-50 py-20">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="text-center text-2xl font-bold sm:text-3xl">How it works</h2>
            <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {steps.map((step, i) => (
                <li key={step.title} className="rounded-2xl border border-slate-200 bg-white p-6">
                  <span className="text-sm font-semibold text-indigo-600">Step {i + 1}</span>
                  <h3 className="mt-2 font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm text-slate-600">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="py-20">
          <div className="mx-auto max-w-6xl px-6">
            <h2 className="text-center text-2xl font-bold sm:text-3xl">Built on trust</h2>
            <div className="mt-12 grid gap-6 sm:grid-cols-2">
              {principles.map((p) => (
                <div key={p.title} className="rounded-2xl border border-slate-200 p-6">
                  <h3 className="font-semibold">{p.title}</h3>
                  <p className="mt-2 text-sm text-slate-600">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="waitlist" className="scroll-mt-8 bg-indigo-50/60 py-20">
          <div className="mx-auto max-w-2xl px-6">
            <h2 className="text-center text-2xl font-bold sm:text-3xl">Request early access</h2>
            <p className="mt-3 text-center text-slate-600">
              We&apos;re opening ConvoPilot to small groups. Tell us a little about you and we&apos;ll be in touch.
            </p>
            <div className="mt-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <Suspense fallback={<p className="text-sm text-slate-500">Loading form…</p>}>
                <WaitlistForm />
              </Suspense>
            </div>
          </div>
        </section>

        <section id="faq" className="py-20">
          <div className="mx-auto max-w-3xl px-6">
            <h2 className="text-center text-2xl font-bold sm:text-3xl">Questions</h2>
            <dl className="mt-10 divide-y divide-slate-200">
              {faqs.map((f) => (
                <div key={f.q} className="py-5">
                  <dt className="font-semibold">{f.q}</dt>
                  <dd className="mt-2 text-sm text-slate-600">{f.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 text-sm text-slate-500">
          <span>© {/* static year avoids a request-time clock read */}2026 ConvoPilot</span>
          <nav className="flex gap-4">
            <Link href="/privacy" className="hover:text-slate-800">Privacy</Link>
            <Link href="/login" className="hover:text-slate-800">Sign in</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
