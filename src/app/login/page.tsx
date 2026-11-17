import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "@/components/ui";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthCard title="Sign in to ConvoPilot">
      <p>We&apos;ll email you a secure sign-in link. No password needed.</p>
      <LoginForm />
      <p className="text-xs text-slate-500">
        ConvoPilot is invite-only right now. Not invited yet?{" "}
        <Link href="/#waitlist" className="font-medium text-indigo-700 underline">
          Request early access
        </Link>
        .
      </p>
    </AuthCard>
  );
}
