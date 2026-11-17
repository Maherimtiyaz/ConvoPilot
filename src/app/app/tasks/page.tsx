import type { Metadata } from "next";

import { EmptyState, ProtectedPage } from "../protected-page";

export const metadata: Metadata = { title: "Tasks" };

export default function TasksPage() {
  return (
    <ProtectedPage title="Tasks" description="Commitments and tasks you've approved.">
      {() => (
        <EmptyState
          heading="No tasks yet"
          body="ConvoPilot will propose commitments and tasks from your conversations. Nothing becomes a task until you approve it."
          milestone="Coming in an upcoming release"
        />
      )}
    </ProtectedPage>
  );
}
