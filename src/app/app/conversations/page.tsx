import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import type { RequestContext } from "@/lib/auth/context";
import { searchMessages } from "@/lib/services/contacts";
import { listConversations } from "@/lib/services/studio";

import { AskHistory } from "../ask-history";
import { EmptyState, LoadingState, ProtectedPage } from "../protected-page";

export const metadata: Metadata = { title: "Conversations" };

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

/** A short window of text around the first matching word, as plain text. */
function snippet(body: string, query: string): string {
  const words = query.toLowerCase().split(/\s+/).filter((w) => w.length > 1);
  const lower = body.toLowerCase();
  const at = words.map((w) => lower.indexOf(w)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, at - 80);
  return `${start > 0 ? "…" : ""}${body.slice(start, start + 220).replace(/\s+/g, " ")}${start + 220 < body.length ? "…" : ""}`;
}

export default function ConversationsPage({ searchParams }: PageProps<"/app/conversations">) {
  return (
    <ProtectedPage wide title="Conversations" description="Everything you've imported, searchable, with cited answers about your history.">
      {(ctx) => (
        <Suspense fallback={<LoadingState />}>
          <Conversations ctx={ctx} searchParams={searchParams} />
        </Suspense>
      )}
    </ProtectedPage>
  );
}

async function Conversations({ ctx, searchParams }: { ctx: RequestContext; searchParams: PageProps<"/app/conversations">["searchParams"] }) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 200) : "";
  const [conversations, hits] = await Promise.all([listConversations(ctx), q ? searchMessages(ctx, q) : Promise.resolve([])]);

  return (
    <div className="space-y-6">
      <AskHistory />
      <section aria-labelledby="search-heading" className="cp-glass rounded-3xl p-5">
        <h2 id="search-heading" className="font-semibold">
          Search messages
        </h2>
        <form role="search" className="mt-3 flex gap-2">
          <label htmlFor="message-search" className="sr-only">
            Search messages
          </label>
          <input id="message-search" name="q" defaultValue={q} maxLength={200} placeholder="Keywords, e.g. deck Friday" className="h-10 min-w-0 flex-1 rounded-xl border border-ink-300 px-3" />
          <button type="submit" className="h-10 rounded-xl border border-ink-300 bg-white px-4 text-sm font-medium hover:bg-ink-100">
            Search
          </button>
        </form>
        {q && (
          <div className="mt-4">
            {hits.length === 0 ? (
              <p className="text-sm text-ink-700">No messages match “{q}”.</p>
            ) : (
              <ul className="divide-y divide-ink-200">
                {hits.map((h) => (
                  <li key={h.id} className="py-3">
                    <Link href={`/app/studio?c=${h.conversationId}#message-${h.position}`} className="font-medium text-route hover:underline">
                      {h.subject} · message [{h.position}]
                    </Link>
                    <span className="ml-2 font-mono text-xs text-ink-500">
                      {h.senderName ?? h.senderEmail ?? "unknown"}
                      {h.sentAt ? ` · ${h.sentAt.slice(0, 10)}` : ""}
                    </span>
                    <p className="mt-1 text-sm text-ink-700">{snippet(h.body, q)}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
      {conversations.length === 0 ? (
        <EmptyState heading="No conversations yet" body="Import a thread in Communication Studio and it will appear here." milestone="Paste or upload .txt, .md or .eml" />
      ) : (
        <section aria-labelledby="all-heading" className="cp-glass rounded-3xl p-5">
          <h2 id="all-heading" className="font-semibold">
            All conversations
          </h2>
          <ul className="mt-3 divide-y divide-ink-200">
            {conversations.map((c) => (
              <li key={c.id}>
                <Link href={`/app/studio?c=${c.id}`} className="flex flex-wrap justify-between gap-2 py-2.5 hover:text-route">
                  <span className="font-medium">{c.subject}</span>
                  <span className="font-mono text-xs text-ink-500">
                    {c.message_count} {c.message_count === 1 ? "message" : "messages"} · {dateFormat.format(new Date(c.created_at))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
