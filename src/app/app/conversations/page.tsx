import type { Metadata } from "next";

import { EmptyState, ProtectedPage } from "../protected-page";

export const metadata: Metadata = { title: "Conversations" };

export default function ConversationsPage() {
  return (
    <ProtectedPage title="Conversations" description="Every conversation you've imported, searchable with evidence.">
      {() => (
        <EmptyState
          heading="No conversations yet"
          body="Imported conversations will be listed here. You'll be able to ask what you discussed with someone and get cited answers."
          milestone="Coming in an upcoming release"
        />
      )}
    </ProtectedPage>
  );
}
