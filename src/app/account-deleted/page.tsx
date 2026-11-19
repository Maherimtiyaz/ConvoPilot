import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/components/ui";

export const metadata: Metadata = { title: "Account deleted" };

export default function AccountDeletedPage() {
  return (
    <AuthCard title="Your account is being deleted">
      <p>Your workspace and everything in it are no longer accessible, and you&apos;ve been signed out on every device.</p>
      <p>Your data is permanently erased after 30 days. Changed your mind? Contact the ConvoPilot team within those 30 days and we can restore your account.</p>
      <p className="text-sm">
        <Link href="/" className="font-medium text-route underline">
          Back to the homepage
        </Link>
      </p>
    </AuthCard>
  );
}
