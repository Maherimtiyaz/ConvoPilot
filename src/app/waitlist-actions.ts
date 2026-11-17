"use server";

import { joinWaitlist } from "@/lib/services/waitlist";
import { readWaitlistFormData, waitlistFormSchema } from "@/lib/validation/waitlist";

export type WaitlistFieldErrors = Partial<Record<"fullName" | "email" | "role" | "companySize" | "biggestChallenge" | "consent", string>>;

export type WaitlistState =
  | { status: "idle" }
  | { status: "joined" }
  | { status: "error"; message: string; fieldErrors: WaitlistFieldErrors };

/** Public action: no sign-in required. The database validates and rate-limits again. */
export async function joinWaitlistAction(_prev: WaitlistState, formData: FormData): Promise<WaitlistState> {
  const raw = readWaitlistFormData(formData);
  if (raw.trap !== "") {
    // Bot trap filled in: pretend success, store nothing.
    return { status: "joined" };
  }
  const parsed = waitlistFormSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: WaitlistFieldErrors = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === "string" && key in raw && !(key in fieldErrors)) {
        fieldErrors[key as keyof WaitlistFieldErrors] = key === "email" ? "Please enter a valid work email." : issue.message;
      }
    }
    return { status: "error", message: "Please check the highlighted fields.", fieldErrors };
  }
  try {
    const outcome = await joinWaitlist(parsed.data);
    if (outcome === "ok") return { status: "joined" };
    if (outcome === "busy") {
      return { status: "error", message: "Lots of people are signing up right now. Please try again in a minute.", fieldErrors: {} };
    }
    return { status: "error", message: "Please check your details and try again.", fieldErrors: {} };
  } catch {
    return { status: "error", message: "Something went wrong on our side. Please try again in a moment.", fieldErrors: {} };
  }
}
