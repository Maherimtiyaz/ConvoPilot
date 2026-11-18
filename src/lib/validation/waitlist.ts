import { z } from "zod";

import { emailSchema } from "./auth";

export const WAITLIST_ROLES = [
  { value: "founder", label: "Founder" },
  { value: "operator", label: "Operator / chief of staff" },
  { value: "investor", label: "Investor" },
  { value: "other", label: "Something else" },
] as const;

export const WAITLIST_COMPANY_SIZES = [
  { value: "solo", label: "Just me" },
  { value: "2-10", label: "2–10 people" },
  { value: "11-50", label: "11–50 people" },
  { value: "51-200", label: "51–200 people" },
  { value: "200+", label: "More than 200" },
] as const;

type Values<T extends readonly { value: string }[]> = T[number]["value"];
const roleValues = WAITLIST_ROLES.map((r) => r.value) as [Values<typeof WAITLIST_ROLES>, ...Values<typeof WAITLIST_ROLES>[]];
const sizeValues = WAITLIST_COMPANY_SIZES.map((s) => s.value) as [
  Values<typeof WAITLIST_COMPANY_SIZES>,
  ...Values<typeof WAITLIST_COMPANY_SIZES>[],
];

/**
 * Waitlist form input. Mirrors the checks in `public.join_waitlist` (the database remains the
 * authority); validating here gives people field-level messages before anything is sent.
 */
export const waitlistFormSchema = z.object({
  fullName: z.string().trim().min(1, "Please tell us your name.").max(120, "Please keep your name under 120 characters."),
  email: emailSchema,
  role: z.enum(roleValues, { error: "Please choose your role." }),
  companySize: z.enum(sizeValues, { error: "Please choose your company size." }),
  biggestChallenge: z
    .string()
    .trim()
    .max(500, "Please keep this under 500 characters.")
    .transform((value) => (value === "" ? null : value)),
  consent: z.literal("yes", { error: "Please agree so we can contact you about early access." }),
  source: z
    .string()
    .trim()
    .toLowerCase()
    .transform((value) => (/^[a-z0-9_-]{1,40}$/.test(value) ? value : null)),
});

export type WaitlistForm = z.output<typeof waitlistFormSchema>;

/** Reads the raw waitlist fields from submitted form data (missing fields become ""). */
export function readWaitlistFormData(formData: FormData) {
  const text = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : "";
  };
  return {
    fullName: text("fullName"),
    email: text("email"),
    role: text("role"),
    companySize: text("companySize"),
    biggestChallenge: text("biggestChallenge"),
    consent: text("consent"),
    source: text("source"),
    /** Hidden bot-trap field: people never see it, simple bots fill it in. */
    trap: text("website"),
  };
}
