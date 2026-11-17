import "server-only";

import { z } from "zod";

import { createSupabaseServerClient, type SupabaseServerContext } from "@/lib/supabase/server";

/**
 * Operator console (M1.5). Every call goes through database functions that re-check that the
 * caller is a platform operator; this module only validates shapes and maps results.
 */

export class OperatorError extends Error {
  constructor(readonly code: "not_authorized" | "invalid" | "failed") {
    super(`Operator request ${code}`);
    this.name = "OperatorError";
  }
}

const waitlistStatus = z.enum(["pending", "invited", "declined"]);
export type WaitlistStatus = z.infer<typeof waitlistStatus>;
const invitationState = z.enum(["open", "accepted", "expired", "revoked"]);
export type InvitationState = z.infer<typeof invitationState>;

const entrySchema = z.object({
  id: z.uuid(),
  email: z.string(),
  full_name: z.string(),
  role: z.string(),
  company_size: z.string(),
  biggest_challenge: z.string().nullable(),
  source: z.string().nullable(),
  status: waitlistStatus,
  created_at: z.string(),
  invited_at: z.string().nullable(),
  invitation_state: invitationState.nullable(),
});
export type WaitlistEntry = z.infer<typeof entrySchema>;

const listSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("ok"),
    total: z.number(),
    counts: z.object({ all: z.number(), pending: z.number(), invited: z.number(), declined: z.number() }),
    entries: z.array(entrySchema),
  }),
  z.object({ status: z.enum(["invalid", "not_authenticated", "not_authorized"]) }),
]);

const inviteResultSchema = z.object({
  entry_id: z.uuid(),
  email: z.string().optional(),
  status: z.enum(["created", "already_invited", "already_member", "not_found", "declined", "invalid"]),
  token: z.string().optional(),
  expires_at: z.string().optional(),
});
const inviteSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), results: z.array(inviteResultSchema) }),
  z.object({ status: z.enum(["invalid", "not_authenticated", "not_authorized"]) }),
]);

const invitationSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  created_at: z.string(),
  expires_at: z.string(),
  consumed_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
  state: invitationState,
});
export type InvitationRow = z.infer<typeof invitationSchema>;
const invitationsSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("ok"), invitations: z.array(invitationSchema) }),
  z.object({ status: z.enum(["invalid", "not_authenticated", "not_authorized"]) }),
]);
const simpleSchema = z.object({ status: z.string() });

async function rpc<T>(context: SupabaseServerContext, fn: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
  const supabase = await createSupabaseServerClient(context);
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    throw new OperatorError("failed");
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw new OperatorError("failed");
  }
  return parsed.data;
}

function fail(status: string): never {
  throw new OperatorError(status === "invalid" ? "invalid" : "not_authorized");
}

export async function isOperator(): Promise<boolean> {
  return rpc("server-component", "current_user_is_operator", {}, z.boolean());
}

export async function listWaitlist(status: WaitlistStatus | null, limit = 200) {
  const result = await rpc("server-component", "list_waitlist", { p_status: status, p_limit: limit, p_offset: 0 }, listSchema);
  if (result.status !== "ok") fail(result.status);
  return result;
}

export async function listInvitations(limit = 200) {
  const result = await rpc("server-component", "list_invitations", { p_limit: limit, p_offset: 0 }, invitationsSchema);
  if (result.status !== "ok") fail(result.status);
  return result.invitations;
}

export type InviteOutcome = z.infer<typeof inviteResultSchema>;

/** Returns per-entry outcomes; created ones carry the one-time token (never stored or logged). */
export async function inviteEntries(entryIds: string[]): Promise<InviteOutcome[]> {
  const result = await rpc("server-action", "invite_waitlist_entries", { p_entry_ids: entryIds }, inviteSchema);
  if (result.status !== "ok") fail(result.status);
  return result.results;
}

export async function setEntryStatus(entryId: string, status: "pending" | "declined"): Promise<void> {
  const result = await rpc("server-action", "set_waitlist_entry_status", { p_entry_id: entryId, p_status: status }, simpleSchema);
  if (result.status !== "ok") fail(result.status);
}

export async function revokeInvitation(invitationId: string): Promise<"revoked" | "not_found"> {
  const result = await rpc("server-action", "revoke_invitation", { p_invitation_id: invitationId }, simpleSchema);
  if (result.status === "revoked" || result.status === "not_found") return result.status;
  fail(result.status);
}
