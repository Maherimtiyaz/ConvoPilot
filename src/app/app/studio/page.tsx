import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import type { RequestContext } from "@/lib/auth/context";
import { listCommitments } from "@/lib/services/commitments";
import { contactIdsByEmail } from "@/lib/services/contacts";
import { getAiSettings, getConversation, listConversations, StudioError, type ConversationDetail } from "@/lib/services/studio";
import { uuidSchema } from "@/lib/validation/studio";

import { LoadingState, ProtectedPage } from "../protected-page";

import { ConversationView } from "./conversation-view";
import { ImportPanel } from "./import-panel";

export const metadata: Metadata = { title: "Communication Studio" };

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export default function StudioPage({ searchParams }: PageProps<"/app/studio">) {
  return (
    <ProtectedPage wide title="Communication Studio" description="Paste or import a conversation, understand it, and draft a reply in your own style.">
      {(ctx) => (
        <Suspense fallback={<LoadingState />}>
          <Studio ctx={ctx} searchParams={searchParams} />
        </Suspense>
      )}
    </ProtectedPage>
  );
}

async function Studio({ ctx, searchParams }: { ctx: RequestContext; searchParams: PageProps<"/app/studio">["searchParams"] }) {
  const params = await searchParams;
  const selected = typeof params.c === "string" && uuidSchema.safeParse(params.c).success ? params.c : null;
  const [conversations, settings] = await Promise.all([listConversations(ctx), getAiSettings(ctx)]);
  let detail: ConversationDetail | null = null;
  let missing = false;
  if (selected) {
    try {
      detail = await getConversation(ctx, selected);
    } catch (error) {
      if (error instanceof StudioError && error.code === "not_found") missing = true;
      else throw error;
    }
  }

  const [contacts, commitments] = detail
    ? await Promise.all([contactIdsByEmail(ctx, detail.messages.map((m) => m.senderEmail ?? "")), listCommitments(ctx, detail.conversation.id)])
    : [{}, []];

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside aria-label="Conversations" className="space-y-3">
        <Link href="/app/studio" className="flex h-10 items-center justify-center rounded-xl bg-ink px-4 text-sm font-semibold text-white hover:bg-ink-700">
          New conversation
        </Link>
        {conversations.length === 0 ? (
          <p className="rounded-[10px] border border-dashed border-ink-300 p-4 text-sm text-ink-700">Your imported conversations will appear here.</p>
        ) : (
          <ul className="space-y-1">
            {conversations.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/app/studio?c=${c.id}`}
                  aria-current={c.id === selected ? "page" : undefined}
                  className={`block rounded-xl px-3 py-2 text-sm ${c.id === selected ? "bg-white font-semibold text-ink shadow-[inset_3px_0_0_var(--color-ink)]" : "text-ink-700 hover:bg-white"}`}
                >
                  <span className="block truncate">{c.subject}</span>
                  <span className="font-mono text-xs text-ink-500">
                    {c.message_count} {c.message_count === 1 ? "message" : "messages"} · {dateFormat.format(new Date(c.created_at))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </aside>
      <div className="min-w-0">
        {missing && (
          <p role="alert" className="mb-4 rounded-xl border border-error/30 bg-error-50 px-3 py-2 text-sm text-error">
            That conversation no longer exists.
          </p>
        )}
        {params.dup === "1" && detail && (
          <p role="status" className="mb-4 rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm text-ink-700">
            You&apos;d already imported this conversation, so we opened the existing copy.
          </p>
        )}
        {detail ? (
          <ConversationView
            key={detail.conversation.id}
            detail={detail}
            contacts={contacts}
            commitments={commitments}
            ai={{ configured: settings.configured, optIn: settings.optIn, spentTodayUsd: settings.spentTodayUsd, capUsd: settings.capUsd }}
            createdLabel={dateFormat.format(new Date(detail.conversation.created_at))}
          />
        ) : (
          <ImportPanel />
        )}
      </div>
    </div>
  );
}
