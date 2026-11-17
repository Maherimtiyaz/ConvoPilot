"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { requireRequestContext } from "@/lib/auth/context";
import { getAppEnv } from "@/lib/env/server";
import { inviteEntries, OperatorError, revokeInvitation, setEntryStatus } from "@/lib/services/operator";

export type InviteResult =
  | { ok: true; created: { email: string; link: string; expiresAt: string }[]; skipped: { email: string; reason: string }[] }
  | { ok: false; error: string };

const SKIP_REASONS: Record<string, string> = {
  already_invited: "already has an open invitation",
  already_member: "already has an account",
  declined: "was declined",
  not_found: "no longer exists",
  invalid: "could not be invited",
};

const idsSchema = z.array(z.uuid()).min(1).max(50);

function errorMessage(error: unknown): string {
  if (error instanceof OperatorError && error.code === "not_authorized") return "Only ConvoPilot operators can do this.";
  if (error instanceof OperatorError && error.code === "invalid") return "That request wasn't valid. Refresh and try again.";
  return "Something went wrong. Please try again.";
}

/** Invites the selected waitlist entries and returns each person's private link, once. */
export async function inviteSelectedAction(entryIds: string[]): Promise<InviteResult> {
  await requireRequestContext();
  const parsed = idsSchema.safeParse(entryIds);
  if (!parsed.success) return { ok: false, error: "Select between 1 and 50 people." };
  try {
    const outcomes = await inviteEntries(parsed.data);
    const origin = getAppEnv().NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
    const created = outcomes
      .filter((o) => o.status === "created" && o.token && o.email)
      .map((o) => ({ email: o.email as string, link: `${origin}/invite#t=${o.token}`, expiresAt: o.expires_at ?? "" }));
    const skipped = outcomes
      .filter((o) => o.status !== "created")
      .map((o) => ({ email: o.email ?? "(unknown)", reason: SKIP_REASONS[o.status] ?? "could not be invited" }));
    refresh();
    return { ok: true, created, skipped };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

const statusSchema = z.object({ entryId: z.uuid(), status: z.enum(["pending", "declined"]) });

export async function setEntryStatusAction(entryId: string, status: "pending" | "declined"): Promise<{ ok: boolean; error?: string }> {
  await requireRequestContext();
  const parsed = statusSchema.safeParse({ entryId, status });
  if (!parsed.success) return { ok: false, error: "That request wasn't valid." };
  try {
    await setEntryStatus(parsed.data.entryId, parsed.data.status);
    refresh();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}

export async function revokeInvitationAction(invitationId: string): Promise<{ ok: boolean; error?: string }> {
  await requireRequestContext();
  const parsed = z.uuid().safeParse(invitationId);
  if (!parsed.success) return { ok: false, error: "That request wasn't valid." };
  try {
    const outcome = await revokeInvitation(parsed.data);
    refresh();
    return outcome === "revoked" ? { ok: true } : { ok: false, error: "That invitation was already used, revoked or expired." };
  } catch (error) {
    return { ok: false, error: errorMessage(error) };
  }
}
