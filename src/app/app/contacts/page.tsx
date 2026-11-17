import type { Metadata } from "next";

import { EmptyState, ProtectedPage } from "../protected-page";

export const metadata: Metadata = { title: "Contacts" };

export default function ContactsPage() {
  return (
    <ProtectedPage title="Contacts" description="People you talk to, with source-linked context.">
      {() => (
        <EmptyState
          heading="No contacts yet"
          body="Contacts you save from conversations will appear here, each linked back to where the information came from."
          milestone="Coming in an upcoming release"
        />
      )}
    </ProtectedPage>
  );
}
