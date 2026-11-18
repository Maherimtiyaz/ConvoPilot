import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import type { RequestContext } from "@/lib/auth/context";
import { listContacts } from "@/lib/services/contacts";

import { EmptyState, LoadingState, ProtectedPage } from "../protected-page";

import { NewContactForm } from "./contact-forms";

export const metadata: Metadata = { title: "Contacts" };

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export default function ContactsPage({ searchParams }: PageProps<"/app/contacts">) {
  return (
    <ProtectedPage wide title="Contacts" description="People you talk to, linked to the conversations they're in.">
      {(ctx) => (
        <Suspense fallback={<LoadingState />}>
          <Contacts ctx={ctx} searchParams={searchParams} />
        </Suspense>
      )}
    </ProtectedPage>
  );
}

async function Contacts({ ctx, searchParams }: { ctx: RequestContext; searchParams: PageProps<"/app/contacts">["searchParams"] }) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const contacts = await listContacts(ctx, q || undefined);
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-4">
        <form role="search" className="flex gap-2">
          <label htmlFor="contact-search" className="sr-only">
            Search contacts
          </label>
          <input id="contact-search" name="q" defaultValue={q} placeholder="Search by name" className="h-10 min-w-0 flex-1 rounded-md border border-ink-300 bg-white px-3" />
          <button type="submit" className="h-10 rounded-md border border-ink-300 bg-white px-4 text-sm font-medium hover:bg-ink-100">
            Search
          </button>
        </form>
        {contacts.length === 0 ? (
          q ? (
            <p className="rounded-[10px] border border-ink-200 bg-white p-6 text-[15px] text-ink-700">No contacts match “{q}”.</p>
          ) : (
            <EmptyState heading="No contacts yet" body="Save a sender from any conversation in Communication Studio, or add someone here." milestone="Contacts link to their conversations automatically" />
          )
        ) : (
          <ul className="divide-y divide-ink-200 rounded-[10px] border border-ink-200 bg-white">
            {contacts.map((c) => (
              <li key={c.id}>
                <Link href={`/app/contacts/${c.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-paper">
                  <span className="min-w-0">
                    <span className="block font-semibold">{c.name}</span>
                    <span className="block truncate text-sm text-ink-500">
                      {[c.roleTitle, c.company, c.emails[0]].filter(Boolean).join(" · ") || "No details yet"}
                    </span>
                  </span>
                  <span className="font-mono text-xs text-ink-500">
                    {c.conversationCount} {c.conversationCount === 1 ? "conversation" : "conversations"}
                    {c.lastInteractionAt ? ` · last ${dateFormat.format(new Date(c.lastInteractionAt))}` : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
      <NewContactForm />
    </div>
  );
}
