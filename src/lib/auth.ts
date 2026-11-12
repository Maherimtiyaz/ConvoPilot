import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { unauthorized } from "@/lib/errors";
import { createClient } from "@/lib/database/supabase-server";

export type SessionUser = Pick<User, "id" | "email">;

export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createClient();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  return { id: data.user.id, email: data.user.email ?? "" };
}

/** For server components: redirects to /login when unauthenticated. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** For route handlers: throws a typed 401 instead of redirecting. */
export async function requireUserApi(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw unauthorized();
  return user;
}
