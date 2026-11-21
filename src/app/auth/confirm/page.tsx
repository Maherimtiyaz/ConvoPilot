import type { Metadata } from "next";

import { AuthCard } from "@/components/ui";

import { ConfirmForm } from "./confirm-form";

export const metadata: Metadata = { title: "Finish signing in", referrer: "no-referrer" };

/**
 * The email link lands here with the token in the URL fragment (`#th=…`), which browsers never
 * send to servers. Opening the page (or a link scanner fetching it) uses nothing; only pressing
 * Continue — a POST — signs in.
 */
export default function ConfirmPage() {
  return (
    <AuthCard title="Finish signing in" step={3}>
      <ConfirmForm />
    </AuthCard>
  );
}
