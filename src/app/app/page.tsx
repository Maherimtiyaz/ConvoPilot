import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

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
      className={`rounded-[10px] border bg-white p-4 hover:border-ink-300 ${emphasis && value > 0 ? "border-marker" : "border-ink-200"}`}
    >
      <span className="block font-display text-4xl font-medium">{value}</span>
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
        <section className="rounded-[10px] border border-ink-200 bg-white p-6">
          <h2 className="font-display text-2xl font-medium">
            Start with one conversation
          </h2>
          <p className="mt-2 max-w-prose text-[15px] text-ink-700">
            Paste an email thread into Communication Studio. ConvoPilot explains
            what they want, drafts a reply in your voice, and suggests the
            commitments to track. You approve everything.
          </p>
          <Link
            href="/app/studio"
            className="mt-4 inline-flex h-10 items-center rounded-md bg-ink px-4 text-sm font-semibold text-white hover:bg-ink-700"
          >
            Open Communication Studio
          </Link>
        </section>
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
          className="min-w-0 rounded-[10px] border border-ink-200 bg-white p-5"
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
          className="min-w-0 rounded-[10px] border border-ink-200 bg-white p-5"
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
