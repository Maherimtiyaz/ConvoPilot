import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/components/ui";

export const metadata: Metadata = { title: "Check your email" };

export default function CheckEmailPage() {
  return (
    <AuthCard title="Check your email">
      <p>If that address can sign in to ConvoPilot, we&apos;ve sent it a link. It works once and expires in 30 minutes.</p>
      <p>Open the link on any device and press <strong>Continue</strong> to sign in.</p>
      <p className="text-xs text-ink-500">
        Nothing arrived after a few minutes? Check your spam folder, or{" "}
        <Link href="/login" className="font-medium text-route underline">
          request a new link
        </Link>
        .
      </p>
    </AuthCard>
  );
}
