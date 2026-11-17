import type { Metadata } from "next";

import { EmptyState, ProtectedPage } from "../protected-page";

export const metadata: Metadata = { title: "Communication Studio" };

export default function StudioPage() {
  return (
    <ProtectedPage title="Communication Studio" description="Paste or import a conversation, understand it, and draft a reply in your own style.">
      {() => (
        <EmptyState
          heading="No conversations analysed yet"
          body="Soon you'll paste an email thread or upload a .txt, .md or .eml file here. ConvoPilot drafts replies; it never sends anything."
          milestone="Coming in an upcoming release"
        />
      )}
    </ProtectedPage>
  );
}
