import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { createClient } from "@/lib/database/supabase-server";
import { getWorkspaceId, listTasks, createTask, listCommitments } from "@/lib/database/repositories";
import { taskCreateSchema } from "@/lib/schemas/productivity";
import { withErrorHandling, AppError } from "@/lib/errors";

export const GET = withErrorHandling(async () => {
  const user = await requireUserApi();
  const supabase = await createClient();
  if (!supabase) throw new AppError("internal_error", "Supabase is not configured");
  const workspaceId = await getWorkspaceId(supabase, user.id);

  const [tasks, proposed, waitingOn] = await Promise.all([
    listTasks(supabase, workspaceId),
    listCommitments(supabase, workspaceId, ["proposed"]),
    listCommitments(supabase, workspaceId, ["active"]),
  ]);

  return NextResponse.json({
    tasks,
    proposedCommitments: proposed.filter((c) => c.owner === "me"),
    waitingOnOthers: waitingOn.filter((c) => c.owner === "them"),
  });
});

export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireUserApi();
  const input = taskCreateSchema.parse(await request.json());

  const supabase = await createClient();
  if (!supabase) throw new AppError("internal_error", "Supabase is not configured");
  const workspaceId = await getWorkspaceId(supabase, user.id);

  const task = await createTask(supabase, workspaceId, {
    title: input.title,
    priority: input.priority,
    due_date: input.dueDate ?? null,
    contact_id: input.contactId ?? null,
    conversation_id: input.conversationId ?? null,
    commitment_id: null,
    origin: "manual",
  });

  return NextResponse.json({ task }, { status: 201 });
});
