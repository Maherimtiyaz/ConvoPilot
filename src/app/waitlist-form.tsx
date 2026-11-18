"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState } from "react";

import { buttonClass, ErrorNotice, inputClass } from "@/components/ui";
import { WAITLIST_COMPANY_SIZES, WAITLIST_ROLES } from "@/lib/validation/waitlist";

import { joinWaitlistAction, type WaitlistState } from "./waitlist-actions";

const initial: WaitlistState = { status: "idle" };

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs text-error">
      {message}
    </p>
  );
}

/** `?ref=linkedin` style links record where people heard about ConvoPilot (letters, digits, - and _). */
export function WaitlistForm() {
  const source = useSearchParams().get("ref") ?? "";
  const [state, formAction, pending] = useActionState(joinWaitlistAction, initial);

  if (state.status === "joined") {
    return (
      <div role="status" className="rounded-2xl border border-success/30 bg-success-50 p-6 text-ink">
        <h3 className="font-semibold">You&apos;re on the list.</h3>
        <p className="mt-1 text-sm">
          Thanks! We&apos;re inviting people in small groups. If you&apos;re picked, you&apos;ll get a personal invitation
          link by email.
        </p>
      </div>
    );
  }

  const errors = state.status === "error" ? state.fieldErrors : {};
  const describedBy = (name: keyof typeof errors) => (errors[name] ? `${name}-error` : undefined);

  return (
    <form action={formAction} noValidate className="space-y-4">
      {state.status === "error" && <ErrorNotice message={state.message} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="fullName" className="text-sm font-medium text-ink">
            Name
          </label>
          <input id="fullName" name="fullName" autoComplete="name" required maxLength={120} aria-invalid={!!errors.fullName} aria-describedby={describedBy("fullName")} className={inputClass} />
          <FieldError id="fullName-error" message={errors.fullName} />
        </div>
        <div className="space-y-1">
          <label htmlFor="waitlist-email" className="text-sm font-medium text-ink">
            Work email
          </label>
          <input id="waitlist-email" name="email" type="email" autoComplete="email" required maxLength={320} aria-invalid={!!errors.email} aria-describedby={describedBy("email")} className={inputClass} />
          <FieldError id="email-error" message={errors.email} />
        </div>
        <div className="space-y-1">
          <label htmlFor="role" className="text-sm font-medium text-ink">
            Your role
          </label>
          <select id="role" name="role" required defaultValue="" aria-invalid={!!errors.role} aria-describedby={describedBy("role")} className={inputClass}>
            <option value="" disabled>
              Choose…
            </option>
            {WAITLIST_ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <FieldError id="role-error" message={errors.role} />
        </div>
        <div className="space-y-1">
          <label htmlFor="companySize" className="text-sm font-medium text-ink">
            Company size
          </label>
          <select id="companySize" name="companySize" required defaultValue="" aria-invalid={!!errors.companySize} aria-describedby={describedBy("companySize")} className={inputClass}>
            <option value="" disabled>
              Choose…
            </option>
            {WAITLIST_COMPANY_SIZES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <FieldError id="companySize-error" message={errors.companySize} />
        </div>
      </div>
      <div className="space-y-1">
        <label htmlFor="biggestChallenge" className="text-sm font-medium text-ink">
          What&apos;s your biggest communication headache? <span className="font-normal text-ink-500">(optional)</span>
        </label>
        <textarea id="biggestChallenge" name="biggestChallenge" rows={3} maxLength={500} aria-describedby={describedBy("biggestChallenge")} className={inputClass} placeholder="e.g. I lose track of what I promised investors over email" />
        <FieldError id="biggestChallenge-error" message={errors.biggestChallenge} />
      </div>
      {/* Bot trap: hidden from people and assistive technology. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="website">Leave this empty</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" defaultValue="" />
      </div>
      <input type="hidden" name="source" value={source.slice(0, 40)} />
      <div className="space-y-1">
        <label className="flex items-start gap-2 text-sm text-ink-700">
          <input type="checkbox" name="consent" value="yes" required aria-invalid={!!errors.consent} aria-describedby={describedBy("consent")} className="mt-1 h-4 w-4 rounded border-ink-300" />
          <span>
            I agree that ConvoPilot may store these details and email me about early access, as described in the{" "}
            <Link href="/privacy" className="font-medium text-route underline">
              privacy notice
            </Link>
            .
          </span>
        </label>
        <FieldError id="consent-error" message={errors.consent} />
      </div>
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? "Joining…" : "Request early access"}
      </button>
    </form>
  );
}
