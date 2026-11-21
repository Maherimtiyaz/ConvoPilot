import type { Metadata } from "next";
import { Suspense } from "react";

import { isOperator, listInvitations, listWaitlist, type WaitlistStatus } from "@/lib/services/operator";

import { LoadingState, ProtectedPage } from "../protected-page";

import { OperatorConsole, type ConsoleEntry, type ConsoleInvitation } from "./operator-console";

export const metadata: Metadata = { title: "Operator console" };

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
const fmt = (iso: string | null) => (iso ? dateFormat.format(new Date(iso)) : "");

export default function OperatorPage({ searchParams }: PageProps<"/app/operator">) {
  return (
    <ProtectedPage wide title="Operator console" description="Review the waitlist, invite people in batches, and manage invitations.">
      {() => (
        <Suspense fallback={<LoadingState />}>
          <Console searchParams={searchParams} />
        </Suspense>
      )}
    </ProtectedPage>
  );
}

async function Console({ searchParams }: { searchParams: PageProps<"/app/operator">["searchParams"] }) {
  if (!(await isOperator())) {
    return (
      <section className="cp-glass rounded-3xl p-8">
        <h2 className="font-display text-2xl font-medium">Operators only</h2>
        <p className="mt-2 text-[15px] text-ink-700">This area is for the ConvoPilot team. Your account doesn&apos;t have access.</p>
      </section>
    );
  }
  const params = await searchParams;
  const view = params.view === "invitations" ? "invitations" : "waitlist";
  const raw = typeof params.status === "string" ? params.status : "pending";
  const status: WaitlistStatus | null = raw === "all" ? null : raw === "invited" || raw === "declined" ? raw : "pending";

  const [waitlist, invitations] = await Promise.all([listWaitlist(status), listInvitations()]);
  const entries: ConsoleEntry[] = waitlist.entries.map((e) => ({
    id: e.id,
    email: e.email,
    name: e.full_name,
    role: e.role,
    companySize: e.company_size,
    challenge: e.biggest_challenge,
    source: e.source,
    status: e.status,
    joined: fmt(e.created_at),
    invitationState: e.invitation_state,
  }));
  const invitationRows: ConsoleInvitation[] = invitations.map((i) => ({
    id: i.id,
    email: i.email,
    created: fmt(i.created_at),
    expires: fmt(i.expires_at),
    state: i.state,
  }));

  return (
    <OperatorConsole
      view={view}
      statusFilter={status ?? "all"}
      counts={waitlist.counts}
      entries={entries}
      invitations={invitationRows}
    />
  );
}
