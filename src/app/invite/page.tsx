import type { Metadata } from "next";

import { AuthCard } from "@/components/ui";

import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Accept your invitation", referrer: "no-referrer" };

export default function InvitePage() {
  return (
    <AuthCard title="You're invited to ConvoPilot" step={1}>
      <p>Confirm your email address and we&apos;ll send you a link to finish creating your account.</p>
      <InviteForm />
    </AuthCard>
  );
}
