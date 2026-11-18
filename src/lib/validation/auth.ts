import { z } from "zod";

import { isWellFormedToken } from "@/lib/auth/fragment";

/** Normalised email address as typed into a sign-in or invitation form. */
export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(320)
  .pipe(z.email());

export const loginFormSchema = z.object({ email: emailSchema });

export const invitationFormSchema = z.object({
  email: emailSchema,
  token: z.string().refine(isWellFormedToken),
});

export const confirmFormSchema = z.object({
  tokenHash: z.string().refine(isWellFormedToken),
});

export const signOutFormSchema = z.object({
  scope: z.enum(["local", "global"]),
});
