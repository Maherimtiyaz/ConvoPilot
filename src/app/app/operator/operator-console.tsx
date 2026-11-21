"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { inviteSelectedAction, revokeInvitationAction, setEntryStatusAction, type InviteResult } from "./actions";

export interface ConsoleEntry {
  id: string;
  email: string;
  name: string;
  role: string;
  companySize: string;
  challenge: string | null;
  source: string | null;
  status: "pending" | "invited" | "declined";
  joined: string;
  invitationState: "open" | "accepted" | "expired" | "revoked" | null;
}

export interface ConsoleInvitation {
  id: string;
  email: string;
  created: string;
  expires: string;
  state: "open" | "accepted" | "expired" | "revoked";
}

interface Props {
  view: "waitlist" | "invitations";
  statusFilter: "pending" | "invited" | "declined" | "all";
  counts: { all: number; pending: number; invited: number; declined: number };
  entries: ConsoleEntry[];
  invitations: ConsoleInvitation[];
}

const STATE_STYLE: Record<string, string> = {
  pending: "bg-ink-100 text-ink-700",
  invited: "bg-route-50 text-route",
  declined: "bg-error-50 text-error",
  open: "bg-warning-50 text-warning",
  accepted: "bg-success-50 text-success",
  expired: "bg-ink-100 text-ink-500",
  revoked: "bg-error-50 text-error",
};

function Chip({ value }: { value: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 font-mono text-xs ${STATE_STYLE[value] ?? "bg-ink-100 text-ink-700"}`}>{value}</span>;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => {
            setDone(true);
            setTimeout(() => setDone(false), 1500);
          },
          () => setDone(false),
        );
      }}
      className="h-9 shrink-0 rounded-xl border border-ink-300 bg-white px-3 text-sm font-medium hover:bg-ink-100"
    >
      {done ? "Copied" : label}
    </button>
  );
}

export function OperatorConsole({ view, statusFilter, counts, entries, invitations }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<InviteResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const invitable = entries.filter((e) => e.status === "pending" || (e.status === "invited" && (e.invitationState === "revoked" || e.invitationState === "expired")));
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const allSelected = invitable.length > 0 && invitable.every((e) => selected.includes(e.id));

  const invite = () =>
    startTransition(async () => {
      setError(null);
      const r = await inviteSelectedAction(selected);
      setResult(r);
      if (r.ok) setSelected([]);
    });

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Something went wrong.");
    });

  const tab = (v: "waitlist" | "invitations", label: string) => (
    <Link
      href={v === "waitlist" ? "/app/operator" : "/app/operator?view=invitations"}
      aria-current={view === v ? "page" : undefined}
      className={`rounded-xl px-3.5 py-2 text-sm font-medium ${view === v ? "bg-ink text-white" : "text-ink-700 hover:bg-ink-100"}`}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {tab("waitlist", `Waitlist (${counts.all})`)}
        {tab("invitations", `Invitations (${invitations.length})`)}
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-error/30 bg-error-50 px-3 py-2 text-sm text-error">
          {error}
        </p>
      )}

      {result?.ok && (
        <section aria-live="polite" className="cp-glass rounded-3xl p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-medium">
                {result.created.length} {result.created.length === 1 ? "invitation" : "invitations"} created
              </h2>
              <p className="mt-1 text-sm text-ink-700">
                Send each person only their own link. Links work once, expire in 7 days, and are shown only now.
              </p>
            </div>
            {result.created.length > 1 && (
              <CopyButton label="Copy all" text={result.created.map((c) => `${c.email}\t${c.link}`).join("\n")} />
            )}
          </div>
          {result.created.length > 0 && (
            <ul className="mt-4 divide-y divide-ink-200 border-y border-ink-200">
              {result.created.map((c) => (
                <li key={c.email} className="flex flex-wrap items-center gap-3 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{c.email}</span>
                    <span className="block break-all font-mono text-xs text-ink-500">{c.link}</span>
                  </span>
                  <CopyButton label="Copy link" text={c.link} />
                </li>
              ))}
            </ul>
          )}
          {result.skipped.length > 0 && (
            <ul className="mt-4 space-y-1 text-sm text-ink-700">
              {result.skipped.map((s) => (
                <li key={s.email}>
                  <span className="font-medium">{s.email}</span> {s.reason}.
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => setResult(null)} className="mt-4 text-sm font-medium text-route hover:underline">
            Done
          </button>
        </section>
      )}
      {result && !result.ok && (
        <p role="alert" className="rounded-xl border border-error/30 bg-error-50 px-3 py-2 text-sm text-error">
          {result.error}
        </p>
      )}

      {view === "waitlist" ? (
        <section className="cp-glass rounded-3xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 p-4">
            <nav aria-label="Filter by status" className="flex flex-wrap gap-1.5">
              {(["pending", "invited", "declined", "all"] as const).map((s) => (
                <Link
                  key={s}
                  href={`/app/operator?status=${s}`}
                  aria-current={statusFilter === s ? "page" : undefined}
                  className={`rounded-full border px-3 py-1 text-sm ${statusFilter === s ? "border-ink bg-ink text-white" : "border-ink-200 text-ink-700 hover:bg-ink-100"}`}
                >
                  {s[0].toUpperCase() + s.slice(1)} · {counts[s]}
                </Link>
              ))}
            </nav>
            <button
              type="button"
              onClick={invite}
              disabled={selected.length === 0 || pending}
              className="h-10 rounded-xl bg-ink px-4 text-sm font-semibold text-white transition hover:bg-ink-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {pending ? "Working…" : `Invite selected (${selected.length})`}
            </button>
          </div>
          {entries.length === 0 ? (
            <p className="p-10 text-center text-[15px] text-ink-700">No one here yet. Share your landing page to grow the waitlist.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="font-mono text-xs uppercase tracking-wider text-ink-500">
                  <tr className="border-b border-ink-200">
                    <th className="w-10 p-3">
                      <input
                        type="checkbox"
                        aria-label="Select all invitable people"
                        checked={allSelected}
                        disabled={invitable.length === 0}
                        onChange={() => setSelected(allSelected ? [] : invitable.slice(0, 50).map((e) => e.id))}
                        className="h-4 w-4"
                      />
                    </th>
                    <th className="p-3 font-normal">Person</th>
                    <th className="p-3 font-normal">Role · size</th>
                    <th className="p-3 font-normal">Biggest challenge</th>
                    <th className="p-3 font-normal">Source</th>
                    <th className="p-3 font-normal">Joined</th>
                    <th className="p-3 font-normal">Status</th>
                    <th className="p-3 font-normal"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-200">
                  {entries.map((e) => {
                    const canInvite = invitable.some((x) => x.id === e.id);
                    return (
                      <tr key={e.id} className="align-top">
                        <td className="p-3">
                          <input
                            type="checkbox"
                            aria-label={`Select ${e.name}`}
                            checked={selected.includes(e.id)}
                            disabled={!canInvite}
                            onChange={() => toggle(e.id)}
                            className="h-4 w-4"
                          />
                        </td>
                        <td className="p-3">
                          <span className="block font-medium text-ink">{e.name}</span>
                          <span className="block text-ink-500">{e.email}</span>
                        </td>
                        <td className="p-3 text-ink-700">{e.role} · {e.companySize}</td>
                        <td className="max-w-xs p-3 text-ink-700">{e.challenge ?? <span className="text-ink-500">—</span>}</td>
                        <td className="p-3 font-mono text-xs text-ink-700">{e.source ?? "direct"}</td>
                        <td className="whitespace-nowrap p-3 text-ink-700">{e.joined}</td>
                        <td className="p-3">
                          <span className="flex flex-col items-start gap-1">
                            <Chip value={e.status} />
                            {e.invitationState && <span className="font-mono text-xs text-ink-500">link {e.invitationState}</span>}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          {e.status === "pending" && (
                            <button type="button" disabled={pending} onClick={() => run(() => setEntryStatusAction(e.id, "declined"))} className="text-sm font-medium text-ink-700 hover:text-error">
                              Decline
                            </button>
                          )}
                          {e.status === "declined" && (
                            <button type="button" disabled={pending} onClick={() => run(() => setEntryStatusAction(e.id, "pending"))} className="text-sm font-medium text-route hover:underline">
                              Restore
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="cp-glass rounded-3xl">
          {invitations.length === 0 ? (
            <p className="p-10 text-center text-[15px] text-ink-700">No invitations yet. Invite people from the waitlist.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-sm">
                <thead className="font-mono text-xs uppercase tracking-wider text-ink-500">
                  <tr className="border-b border-ink-200">
                    <th className="p-3 font-normal">Email</th>
                    <th className="p-3 font-normal">Sent</th>
                    <th className="p-3 font-normal">Expires</th>
                    <th className="p-3 font-normal">State</th>
                    <th className="p-3 font-normal"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-200">
                  {invitations.map((i) => (
                    <tr key={i.id}>
                      <td className="p-3 font-medium">{i.email}</td>
                      <td className="whitespace-nowrap p-3 text-ink-700">{i.created}</td>
                      <td className="whitespace-nowrap p-3 text-ink-700">{i.expires}</td>
                      <td className="p-3"><Chip value={i.state} /></td>
                      <td className="p-3 text-right">
                        {i.state === "open" && (
                          <button type="button" disabled={pending} onClick={() => run(() => revokeInvitationAction(i.id))} className="text-sm font-medium text-ink-700 hover:text-error">
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
