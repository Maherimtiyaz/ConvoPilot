import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/components/ui";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthCard title="Sign in to ConvoPilot" step={1}>
      <p>We&apos;ll email you a secure sign-in link. No password needed.</p>
      <LoginForm />
      <p className="text-xs text-ink-500">
        ConvoPilot is invite-only right now. Not invited yet?{" "}
        <Link href="/#waitlist" className="font-medium text-route underline">
          Request early access
        </Link>
        .
      </p>
    </AuthCard>
  );
}
