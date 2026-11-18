import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import type { RequestContext } from "@/lib/auth/context";
import { getContact } from "@/lib/services/contacts";
import { StudioError } from "@/lib/services/studio";
import { uuidSchema } from "@/lib/validation/studio";

import { AskHistory } from "../../ask-history";
import { LoadingState, ProtectedPage } from "../../protected-page";
import { EditContactForm } from "../contact-forms";

export const metadata: Metadata = { title: "Contact" };

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export default function ContactPage({ params }: PageProps<"/app/contacts/[id]">) {
  return (
    <ProtectedPage wide title="Contact" description="Who they are and what you've discussed.">
      {(ctx) => (
        <Suspense fallback={<LoadingState />}>
          <Contact ctx={ctx} params={params} />
        </Suspense>
      )}
    </ProtectedPage>
  );
}

async function Contact({ ctx, params }: { ctx: RequestContext; params: PageProps<"/app/contacts/[id]">["params"] }) {
  const { id } = await params;
  let contact;
  try {
    if (!uuidSchema.safeParse(id).success) throw new StudioError("not_found");
    contact = await getContact(ctx, id);
  } catch (error) {
    if (error instanceof StudioError && error.code === "not_found") {
      return (
        <p role="alert" className="rounded-md border border-error/30 bg-error-50 px-3 py-2 text-sm text-error">
          That contact no longer exists. <Link href="/app/contacts" className="underline">Back to contacts</Link>
        </p>
      );
    }
    throw error;
  }
  return (
    <div className="space-y-6">
      <div>
        <Link href="/app/contacts" className="text-sm text-route hover:underline">
          ← All contacts
        </Link>
        <h2 className="mt-2 font-display text-4xl font-medium tracking-tight">{contact.name}</h2>
        <p className="mt-1 text-[15px] text-ink-700">{[contact.roleTitle, contact.company].filter(Boolean).join(" · ") || "No role or company yet"}</p>
        {contact.emails.length > 0 && <p className="mt-1 font-mono text-xs text-ink-500">{contact.emails.join(" · ")}</p>}
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          <AskHistory heading={`Ask about ${contact.name}`} defaultQuestion={`What did I discuss with ${contact.name}?`} />
          <section className="rounded-[10px] border border-ink-200 bg-white p-5">
            <h2 className="font-semibold">Conversations</h2>
            {contact.conversations.length === 0 ? (
              <p className="mt-2 text-sm text-ink-700">No conversations with {contact.name} yet. Conversations from their email address link here automatically.</p>
            ) : (
              <ul className="mt-3 divide-y divide-ink-200">
                {contact.conversations.map((c) => (
                  <li key={c.id}>
                    <Link href={`/app/studio?c=${c.id}`} className="flex flex-wrap justify-between gap-2 py-2.5 hover:text-route">
                      <span className="font-medium">{c.subject}</span>
                      <span className="font-mono text-xs text-ink-500">
                        {c.messageCount} {c.messageCount === 1 ? "message" : "messages"} · {dateFormat.format(new Date(c.createdAt))}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <EditContactForm id={contact.id} name={contact.name} roleTitle={contact.roleTitle} notes={contact.notes} />
      </div>
    </div>
  );
}
