import "server-only";

import { z } from "zod";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { WaitlistForm } from "@/lib/validation/waitlist";

export type JoinWaitlistOutcome = "ok" | "busy" | "invalid";

const joinWaitlistResult = z.object({ status: z.enum(["ok", "busy", "invalid"]) });

/**
 * Adds someone to the public early-access waitlist through `public.join_waitlist`.
 * The database validates again, rate-limits globally and answers "ok" for new and repeated
 * emails alike, so this never reveals who is already on the list.
 */
export async function joinWaitlist(form: WaitlistForm): Promise<JoinWaitlistOutcome> {
  const supabase = await createSupabaseServerClient("server-action");
  const { data, error } = await supabase.rpc("join_waitlist", {
    p_email: form.email,
    p_full_name: form.fullName,
    p_role: form.role,
    p_company_size: form.companySize,
    p_biggest_challenge: form.biggestChallenge,
    p_consent: true,
    p_source: form.source,
  });
  if (error) {
    throw new Error("Waitlist request failed");
  }
  const parsed = joinWaitlistResult.safeParse(data);
  if (!parsed.success) {
    throw new Error("Waitlist request returned an unexpected result");
  }
  return parsed.data.status;
}
