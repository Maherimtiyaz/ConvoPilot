import type { Metadata } from "next";
import Link from "next/link";

import { Logo } from "@/components/ui";

export const metadata: Metadata = { title: "Privacy notice — ConvoPilot" };

/**
 * DRAFT privacy notice in plain language. It must be reviewed by the owner and a legal adviser
 * before public launch (CLAUDE.md §11, §13; tracked in docs/WORKLOG.md).
 */
export default function PrivacyPage() {
  return (
    <div className="flex-1 bg-white">
      <header className="mx-auto max-w-3xl px-6 py-5">
        <Logo />
      </header>
      <main className="mx-auto max-w-3xl px-6 pb-20 text-ink-700">
        <p className="rounded-md border border-warning/30 bg-warning-50 px-3 py-2 text-sm text-warning">
          Draft — this notice is being reviewed and may change before ConvoPilot opens more widely.
        </p>
        <h1 className="mt-6 font-display text-5xl font-medium tracking-tight text-ink">Privacy notice</h1>
        <div className="mt-6 space-y-6 text-sm leading-6">
          <section>
            <h2 className="text-lg font-semibold text-ink">Joining the waitlist</h2>
            <p>
              When you request early access we store your name, work email, role, company size, your answer about
              communication challenges (if you give one), where you heard about us, and when you agreed to be contacted.
              We use this only to decide whom to invite, to email you about early access, and to understand who
              ConvoPilot should serve. We don&apos;t sell it or share it for advertising.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-ink">Using ConvoPilot</h2>
            <p>
              Your account is a private workspace. Conversations you paste or upload are stored so ConvoPilot can analyse
              them and help you reply. Other users can&apos;t see or change your data. ConvoPilot cannot send messages on
              your behalf. Sign-in uses one-time email links; we never ask for or store a password.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-ink">Service providers</h2>
            <p>
              We use hosting, database and email providers to run ConvoPilot. When AI features launch, the text you
              choose to analyse will be processed by an AI provider. We&apos;ll name every provider and explain its data
              terms here before that happens.
            </p>
          </section>
          <section>
            <h2 className="text-lg font-semibold text-ink">Your choices</h2>
            <p>
              You can ask us to remove you from the waitlist, or to delete your account and its data, at any time. Deleted
              content disappears from your workspace immediately and is permanently erased after a retention period
              we&apos;ll state here before launch.
            </p>
          </section>
        </div>
        <p className="mt-10 text-sm">
          <Link href="/" className="font-medium text-route underline">Back to home</Link>
        </p>
      </main>
    </div>
  );
}
