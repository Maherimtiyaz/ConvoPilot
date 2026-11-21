import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { SignupSteps, Sparks } from "@/components/ui";
import type { RequestContext } from "@/lib/auth/context";
import { getTimeZone, listTasks, localDays } from "@/lib/services/commitments";
import { listConversations } from "@/lib/services/studio";

import { LoadingState, ProtectedPage } from "./protected-page";

export const metadata: Metadata = { title: "Dashboard" };

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export default function DashboardPage() {
  return (
    <ProtectedPage
      wide
      title="Dashboard"
      description="Your follow-ups, commitments and recent conversations at a glance."
    >
      {(ctx) => (
        <Suspense fallback={<LoadingState />}>
          <Dashboard ctx={ctx} />
        </Suspense>
      )}
    </ProtectedPage>
  );
}

function Stat({
  label,
  value,
  href,
  emphasis,
}: {
  label: string;
  value: number;
  href: string;
  emphasis?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`cp-glass cp-lift relative overflow-hidden rounded-3xl p-5 ${emphasis && value > 0 ? "ring-2 ring-[#C9B6FF]" : ""}`}
    >
      {emphasis && value > 0 && <span aria-hidden="true" className="absolute right-4 top-4 h-2 w-2 rounded-full bg-gradient-to-br from-[#7B5CFF] to-[#FF8A65]" />}
      <span className={`block font-display text-5xl ${emphasis && value > 0 ? "cp-aurora-text" : ""}`}>{value}</span>
      <span className="mt-1 block text-sm text-ink-700">{label}</span>
    </Link>
  );
}

async function Dashboard({ ctx }: { ctx: RequestContext }) {
  const [tasks, conversations, timeZone] = await Promise.all([listTasks(ctx), listConversations(ctx), getTimeZone(ctx)]);
  const { today, inAWeek: week } = localDays(timeZone);
  const open = tasks.filter((t) => t.status === "open");
  const awaiting = tasks.filter((t) => t.status === "proposed").length;
  const overdue = open.filter((t) => t.dueDate && t.dueDate < today).length;
  const dueSoon = open.filter(
    (t) => t.dueDate && t.dueDate >= today && t.dueDate <= week,
  ).length;
  const next = [...open]
    .sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"))
    .slice(0, 5);

  const signedIn = (
    <p className="text-sm text-ink-700">
      Signed in as{" "}
      <span className="font-medium">{ctx.email ?? "your account"}</span>.
    </p>
  );

  if (tasks.length === 0 && conversations.length === 0) {
    return (
      <div className="space-y-6">
        {signedIn}
        {/* First visit: the last step of getting started, then three things to try. */}
        <section className="cp-glass-strong relative overflow-hidden rounded-[28px] p-8 text-center sm:p-10">
          <span className="relative mx-auto grid h-16 w-16 place-items-center">
            <Sparks />
            <span className="cp-pop grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-[#7B5CFF] to-[#FF8A65] text-white shadow-[0_14px_30px_-12px_rgba(91,63,224,0.7)]">
              <svg viewBox="0 0 16 16" width="28" height="28" className="cp-check" aria-hidden="true">
                <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </span>
          <h2 className="mt-6 font-display text-3xl">
            You&apos;re in. Start with one conversation
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-ink-700">
            Paste an email thread into Communication Studio. ConvoPilot explains
            what they want, drafts a reply in your voice, and suggests the
            commitments to track. You approve everything.
          </p>
          <div className="mt-6 flex justify-center">
            <SignupSteps step={4} />
          </div>
        </section>
        <ol className="grid gap-4 sm:grid-cols-3">
          {[
            { n: "1", title: "Allow AI processing", body: "One switch in Settings, so ConvoPilot can read the threads you choose.", href: "/app/settings", cta: "Open Settings" },
            { n: "2", title: "Paste your first thread", body: "See what they want and a reply drafted in your voice.", href: "/app/studio", cta: "Open Communication Studio" },
            { n: "3", title: "Approve a commitment", body: "Confirm a promise and it lands on your task list.", href: "/app/tasks", cta: "See Tasks" },
          ].map((s, i) => (
            <li key={s.n} className={`cp-glass cp-lift cp-rise rounded-3xl p-6 cp-d${i + 2}`}>
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-[#C9B6FF] to-[#FFC6A8] text-sm font-semibold">{s.n}</span>
              <h3 className="mt-4 font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-700">{s.body}</p>
              <Link href={s.href} className="group mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-route">
                {s.cta} <span className="cp-arrow" aria-hidden="true">→</span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {signedIn}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Waiting for your approval"
          value={awaiting}
          href="/app/tasks"
          emphasis
        />
        <Stat label="Open tasks" value={open.length} href="/app/tasks" />
        <Stat label="Overdue" value={overdue} href="/app/tasks" emphasis />
        <Stat
          label="Due in the next 7 days"
          value={dueSoon}
          href="/app/tasks"
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <section
          aria-labelledby="next-heading"
          className="min-w-0 cp-glass rounded-3xl p-5"
        >
          <h2 id="next-heading" className="font-semibold">
            Next up
          </h2>
          {next.length === 0 ? (
            <p className="mt-2 text-sm text-ink-700">No open tasks.</p>
          ) : (
            <ul className="mt-3 divide-y divide-ink-200">
              {next.map((t) => (
                <li
                  key={t.id}
                  className="flex justify-between gap-3 py-2.5 text-[15px]"
                >
                  <span className="min-w-0 truncate">{t.title}</span>
                  <span
                    className={`shrink-0 font-mono text-xs ${t.dueDate && t.dueDate < today ? "text-error" : "text-ink-500"}`}
                  >
                    {t.dueDate
                      ? dateFormat.format(new Date(`${t.dueDate}T00:00:00Z`))
                      : (t.dueText ?? "")}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/app/tasks"
            className="mt-3 inline-block text-sm text-route hover:underline"
          >
            All tasks →
          </Link>
        </section>
        <section
          aria-labelledby="recent-heading"
          className="min-w-0 cp-glass rounded-3xl p-5"
        >
          <h2 id="recent-heading" className="font-semibold">
            Recent conversations
          </h2>
          {conversations.length === 0 ? (
            <p className="mt-2 text-sm text-ink-700">None yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-ink-200">
              {conversations.slice(0, 5).map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/app/studio?c=${c.id}`}
                    className="flex justify-between gap-3 py-2.5 text-[15px] hover:text-route"
                  >
                    <span className="min-w-0 truncate">{c.subject}</span>
                    <span className="shrink-0 font-mono text-xs text-ink-500">
                      {dateFormat.format(new Date(c.created_at))}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/app/conversations"
            className="mt-3 inline-block text-sm text-route hover:underline"
          >
            All conversations →
          </Link>
        </section>
      </div>
    </div>
  );
}
