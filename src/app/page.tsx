import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { ThemeToggle } from "@/components/theme";
import { AuroraBackground, Logo } from "@/components/ui";

import { HeroOrbit, HeroSignal, Mark, RotatingBadge } from "./landing-heroes";
import { ProductDemo } from "./product-demo";
import { ShowcaseCarousel } from "./showcase-carousel";
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

/** The moving wall of conversations (sample content, decorative). */
const wallTop = [
  { label: "Investor update", text: "“Can you share Q3 numbers before Monday?”" },
  { label: "Hiring", text: "“Let's talk next week about the plan.”" },
  { label: "✓ Approved", text: "Send revised deck · Friday", tone: "lilac" },
  { label: "Customer", text: "“Does it support single sign-on?”" },
  { label: "Partnership", text: "“Joint webinar in April?”" },
];
const wallBottom = [
  { label: "Draft · your voice", text: "“Yes, Tuesday at 10 works.”", tone: "peach" },
  { label: "Vendor", text: "“Invoice INV-2041 due April 1.”" },
  { label: "Advisor", text: "“Send me the hiring plan when ready.”" },
  { label: "No record", text: "“Berlin office?” Nothing found.", tone: "lilac" },
  { label: "Board", text: "“Agenda for Thursday?”" },
];

function WallRow({ items, direction }: { items: { label: string; text: string; tone?: string }[]; direction: "l" | "r" }) {
  return (
    <div className={`flex w-max gap-4 ${direction === "l" ? "cp-marquee-l" : "cp-marquee-r"}`}>
      {[...items, ...items].map((t, i) => (
        <div
          key={i}
          className={`cp-glass w-[260px] shrink-0 rounded-[20px] p-[18px] ${t.tone === "lilac" ? "!border-[rgba(123,92,255,0.3)]" : t.tone === "peach" ? "!border-[rgba(255,138,101,0.35)]" : ""}`}
        >
          <p className={`text-xs ${t.tone === "lilac" ? "text-route" : t.tone === "peach" ? "text-[#D9643F] dark:text-[#FFC6A8]" : "text-ink-500"}`}>{t.label}</p>
          <p className="mt-2 text-[15px]">{t.text}</p>
        </div>
      ))}
    </div>
  );
}

export default function LandingPage() {
  return (
    <div className="relative flex flex-1 flex-col overflow-x-clip text-ink">
      <AuroraBackground />

      <header className="sticky top-0 z-30 px-3 pt-3 sm:px-6">
        <div className="cp-glass mx-auto flex w-full max-w-6xl items-center justify-between gap-2 rounded-full py-2 pl-5 pr-2">
          <Logo className="h-5 w-auto sm:h-6" />
          <nav className="flex items-center gap-1 whitespace-nowrap text-sm font-medium">
            <a href="#how-it-works" className="hidden rounded-full px-3.5 py-2 text-ink-700 transition hover:bg-white/70 hover:text-ink md:inline">How it works</a>
            <a href="#trust" className="hidden rounded-full px-3.5 py-2 text-ink-700 transition hover:bg-white/70 hover:text-ink md:inline">Trust</a>
            <a href="#faq" className="hidden rounded-full px-3.5 py-2 text-ink-700 transition hover:bg-white/70 hover:text-ink md:inline">FAQ</a>
            <Link href="/login" className="hidden rounded-full px-3.5 py-2 text-ink-700 transition hover:bg-white/70 hover:text-ink min-[360px]:inline">Sign in</Link>
            <ThemeToggle />
            <a href="#waitlist" className="rounded-full bg-ink px-4 py-2.5 text-white shadow-[0_8px_20px_-10px_rgba(23,21,31,0.6)] transition hover:-translate-y-px hover:bg-ink-700">
              <span className="sm:hidden">Early access</span>
              <span className="hidden sm:inline">Get early access</span>
            </a>
          </nav>
        </div>
      </header>

      <main>
        <HeroOrbit />
        <HeroSignal />

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
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#C9B6FF] to-[#FFC6A8] font-mono text-xs font-semibold text-[#17151F]">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="mt-5 font-display text-2xl">{p.title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-700">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Showcase 1: suggested commitments, the current one glowing */}
        <section className="py-20 text-center">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <span className="inline-block rounded-full border border-ink-200 px-3.5 py-1.5 text-xs text-ink-700">Inside ConvoPilot</span>
            <h2 className="mt-5 text-[clamp(2.4rem,6vw,4rem)] font-normal leading-[1.05] tracking-[-0.03em]">
              Your promises, <span className="font-serif italic">kept</span>
              <br />
              <span className="cp-aurora-text font-serif italic">in view.</span>
            </h2>
            <p className="mx-auto mt-4 max-w-md leading-relaxed text-ink-500">
              Every commitment links back to the message it came from, and waits for your yes.
            </p>
            <ShowcaseCarousel />
          </div>
        </section>

        <section id="trust" className="scroll-mt-24 py-20">
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

        {/* Showcase 2: a moving wall of the kinds of conversations it handles (pauses on hover) */}
        <section className="py-12">
          <p className="mb-6 text-center font-mono text-xs uppercase tracking-[0.16em] text-ink-500">The conversations it keeps track of · samples</p>
          <div className="cp-marquee cp-fade-edges space-y-4 overflow-hidden py-2" aria-hidden="true">
            <WallRow items={wallTop} direction="l" />
            <WallRow items={wallBottom} direction="r" />
          </div>
        </section>

        {/* Showcase 3: closing call to action with the waitlist form */}
        <section id="waitlist" className="scroll-mt-24 py-20">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="text-center lg:text-left">
              <RotatingBadge id="closing-badge" className="mx-auto lg:mx-0" />
              <p className="mt-8 text-2xl text-ink-500">Ready when you are</p>
              <p className="mt-1 text-[clamp(3rem,7vw,4.5rem)] leading-none tracking-[-0.03em]" aria-hidden="true">Join the</p>
              <p className="cp-aurora-text font-serif text-[clamp(3.3rem,7.5vw,5rem)] italic leading-[1.05]" aria-hidden="true">waitlist</p>
              <h2 className="mt-6 font-display text-2xl font-semibold">Request early access</h2>
              <p className="mx-auto mt-2 max-w-md text-ink-700 lg:mx-0">
                We&apos;re opening ConvoPilot to small groups. Tell us a little about you and we&apos;ll be in touch.
              </p>
            </div>
            <div className="cp-glass-strong relative rounded-[28px] p-6 sm:p-9">
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

      {/* Bento footer */}
      <footer className="pb-12 pt-6">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 sm:px-6 md:grid-cols-3">
          <div className="cp-glass relative flex min-h-60 flex-col justify-between gap-8 overflow-hidden rounded-[26px] p-7 md:col-span-2">
            <span aria-hidden="true" className="pointer-events-none absolute -bottom-24 -right-4 font-serif text-[220px] italic leading-none text-ink/[0.05]">cp</span>
            <div className="relative">
              <Logo className="h-6 w-auto" />
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-ink-500">
                The AI chief of staff for your conversations. Private workspace · nothing sent for you · every answer cited.
              </p>
            </div>
            <div className="relative flex flex-wrap items-end justify-between gap-3 text-xs text-ink-500">
              <span>© 2026 ConvoPilot</span>
              <nav className="flex flex-wrap gap-2" aria-label="Footer">
                <a href="#how-it-works" className="rounded-full border border-ink-200 px-3 py-1.5 transition hover:border-ink-300 hover:text-ink">How it works</a>
                <Link href="/privacy" className="rounded-full border border-ink-200 px-3 py-1.5 transition hover:border-ink-300 hover:text-ink">Privacy</Link>
                <Link href="/login" className="rounded-full border border-ink-200 px-3 py-1.5 transition hover:border-ink-300 hover:text-ink">Sign in</Link>
              </nav>
            </div>
          </div>
          <a href="#waitlist" className="cp-glass cp-lift group flex min-h-60 flex-col justify-between rounded-[26px] p-7">
            <Mark id="footer-mark" className="h-7 w-12" />
            <span>
              <span className="block text-xl leading-snug">
                Be first in
                <br />
                the next group
              </span>
              <span className="mt-4 inline-flex items-center gap-2.5 text-sm font-medium text-ink-700">
                Join the waitlist
                <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-white transition group-hover:translate-x-1" aria-hidden="true">→</span>
              </span>
            </span>
          </a>
        </div>
      </footer>
    </div>
  );
}
