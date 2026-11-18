import "server-only";

import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface RequestContext {
  userId: string;
  email: string | null;
  workspaceId: string;
  role: "owner" | "member";
}

export type RequestContextResult =
  | { status: "authenticated"; context: RequestContext }
  | { status: "unauthenticated" }
  | { status: "no_workspace"; userId: string };

const membershipRow = z.object({
  workspace_id: z.uuid(),
  role: z.enum(["owner", "member"]),
});

/**
 * The authoritative identity check for a request (CLAUDE.md §10).
 *
 * - `auth.getUser()` asks Supabase Auth to validate the session. Unlike reading the JWT, this
 *   also rejects sessions revoked by sign-out (verified: PostgREST alone would still accept the
 *   old access token until it expires).
 * - The workspace comes from the user's membership row, read through RLS: a soft-deleted
 *   workspace (account deletion requested) is invisible, which yields `no_workspace`.
 *
 * Memoised per request with React `cache()` (never across requests or users).
 */
export const getRequestContext = cache(async (): Promise<RequestContextResult> => {
  // Identity is always checked per request, never during (runtime) prerendering: the Auth client
  // reads the clock, and a private result must not be prerendered.
  await connection();
  const supabase = await createSupabaseServerClient("server-component");
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { status: "unauthenticated" };
  }

  const { data: rows, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", data.user.id)
    .limit(1);
  if (membershipError) {
    throw new Error("Workspace membership lookup failed");
  }
  const parsed = z.array(membershipRow).safeParse(rows);
  if (!parsed.success) {
    throw new Error("Workspace membership lookup returned an unexpected shape");
  }
  const membership = parsed.data[0];
  if (!membership) {
    return { status: "no_workspace", userId: data.user.id };
  }

  return {
    status: "authenticated",
    context: {
      userId: data.user.id,
      email: data.user.email ?? null,
      workspaceId: membership.workspace_id,
      role: membership.role,
    },
  };
});

/**
 * For protected pages and Server Actions: returns the request context or redirects.
 * Must be called inside a `<Suspense>` boundary when used during rendering (Cache Components).
 */
export async function requireRequestContext(): Promise<RequestContext> {
  const result = await getRequestContext();
  if (result.status === "unauthenticated") {
    redirect("/login");
  }
  if (result.status === "no_workspace") {
    redirect("/app/account-unavailable");
  }
  return result.context;
}
