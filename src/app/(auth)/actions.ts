"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/database/supabase-server";

const credentialsSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type AuthFormState = { error: string | null };

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  if (!supabase) return { error: "Supabase is not configured. See the dashboard setup notice." };

  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "Invalid email or password" };

  redirect("/dashboard");
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const supabase = await createClient();
  if (!supabase) return { error: "Supabase is not configured. See the dashboard setup notice." };

  const displayName = String(formData.get("display_name") ?? "").trim();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: displayName ? { display_name: displayName } : undefined,
      emailRedirectTo: "/login",
    },
  });

  if (error) return { error: error.message };

  if (!data.session) {
    return { error: "Check your inbox to confirm your email address, then sign in." };
  }

  redirect("/dashboard");
}
