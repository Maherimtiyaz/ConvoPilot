import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { createClient } from "@/lib/database/supabase-server";
import { getWorkspaceId, updateTask, logAudit } from "@/lib/database/repositories";
import { taskUpdateSchema } from "@/lib/schemas/productivity";
import { withErrorHandling, AppError } from "@/lib/errors";

export const PATCH = withErrorHandling(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUserApi();
    const { id: taskId } = await params;
    const input = taskUpdateSchema.parse(await request.json());

    const supabase = await createClient();
    if (!supabase) throw new AppError("internal_error", "Supabase is not configured");
    const workspaceId = await getWorkspaceId(supabase, user.id);

    const task = await updateTask(supabase, workspaceId, taskId, input);

    if (input.status) {
      await logAudit(supabase, workspaceId, {
        actor: user.id,
        action: `task.status.${input.status}`,
        target_type: "task",
        target_id: task.id,
      });
    }

    return NextResponse.json({ task });
  },
);
