import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/database/supabase-server";
import { getWorkspaceId, listTasks, listCommitments } from "@/lib/database/repositories";
import { TasksWorkspace } from "@/components/tasks/tasks-workspace";

export default async function TasksPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const initialData = supabase
    ? await (async () => {
        const workspaceId = await getWorkspaceId(supabase, user.id);
        const [tasks, proposed, waitingOn] = await Promise.all([
          listTasks(supabase, workspaceId),
          listCommitments(supabase, workspaceId, ["proposed"]),
          listCommitments(supabase, workspaceId, ["active"]),
        ]);
        return {
          tasks,
          proposedCommitments: proposed.filter((c) => c.owner === "me"),
          waitingOnOthers: waitingOn.filter((c) => c.owner === "them"),
        };
      })()
    : { tasks: [], proposedCommitments: [], waitingOnOthers: [] };

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Tasks & Follow-ups</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Commitments and follow-ups. Agent-proposed commitments wait in the approval queue — nothing becomes a task
          without you.
        </p>
      </header>

      <TasksWorkspace initialData={initialData} />
    </div>
  );
}
