import type { Metadata } from "next";

import { EmptyState, ProtectedPage } from "./protected-page";

export const metadata: Metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <ProtectedPage title="Dashboard" description="Your follow-ups, commitments and recent conversations at a glance.">
      {(context) => (
        <div className="space-y-6">
          <p className="text-sm text-slate-700">
            Signed in as <span className="font-medium">{context.email ?? "your account"}</span>.
          </p>
          <EmptyState
            heading="Nothing here yet"
            body="Once Communication Studio is ready you'll paste a conversation, and your follow-ups and commitments will appear here."
            milestone="Coming in an upcoming release"
          />
        </div>
      )}
    </ProtectedPage>
  );
}
