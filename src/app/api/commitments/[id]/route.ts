import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { createClient } from "@/lib/database/supabase-server";
import {
  getWorkspaceId,
  getCommitment,
  updateCommitmentStatus,
  createTask,
  logAudit,
} from "@/lib/database/repositories";
import { commitmentActionSchema } from "@/lib/schemas/productivity";
import { withErrorHandling, AppError } from "@/lib/errors";

/**
 * Human approval workflow for proposed commitments.
 * - approve: proposal becomes an active commitment; owner="me" also creates
 *   a linked task (origin=proposed). owner="them" goes to the waiting-on list.
 * - dismiss: proposal is dismissed, nothing else changes.
 * - complete: an active commitment is marked completed.
 */
export const PATCH = withErrorHandling(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUserApi();
    const { id: commitmentId } = await params;
    const { action } = commitmentActionSchema.parse(await request.json());

    const supabase = await createClient();
    if (!supabase) throw new AppError("internal_error", "Supabase is not configured");
    const workspaceId = await getWorkspaceId(supabase, user.id);

    const commitment = await getCommitment(supabase, workspaceId, commitmentId);

    if (action === "approve") {
      if (commitment.status !== "proposed") {
        return NextResponse.json(
          { error: { code: "conflict", message: "Only proposed commitments can be approved" } },
          { status: 409 },
        );
      }
      const approved = await updateCommitmentStatus(supabase, workspaceId, commitmentId, "active", true);

      let task = null;
      if (commitment.owner === "me") {
        task = await createTask(supabase, workspaceId, {
          title: commitment.description,
          priority: "medium",
          due_date: commitment.due_date,
          contact_id: commitment.contact_id,
          conversation_id: commitment.conversation_id,
          commitment_id: commitment.id,
          origin: "proposed",
        });
      }

      await logAudit(supabase, workspaceId, {
        actor: user.id,
        action: "commitment.approved",
        target_type: "commitment",
        target_id: commitment.id,
        metadata: { task_created: Boolean(task) },
      });

      return NextResponse.json({ commitment: approved, task });
    }

    if (action === "dismiss") {
      if (commitment.status !== "proposed") {
        return NextResponse.json(
          { error: { code: "conflict", message: "Only proposed commitments can be dismissed" } },
          { status: 409 },
        );
      }
      const dismissed = await updateCommitmentStatus(supabase, workspaceId, commitmentId, "dismissed", false);
      await logAudit(supabase, workspaceId, {
        actor: user.id,
        action: "commitment.dismissed",
        target_type: "commitment",
        target_id: commitment.id,
      });
      return NextResponse.json({ commitment: dismissed });
    }

    // action === "complete"
    if (commitment.status !== "active") {
      return NextResponse.json(
        { error: { code: "conflict", message: "Only active commitments can be completed" } },
        { status: 409 },
      );
    }
    const completed = await updateCommitmentStatus(supabase, workspaceId, commitmentId, "completed", true);
    await logAudit(supabase, workspaceId, {
      actor: user.id,
      action: "commitment.completed",
      target_type: "commitment",
      target_id: commitment.id,
    });
    return NextResponse.json({ commitment: completed });
  },
);
