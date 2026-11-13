import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { createClient } from "@/lib/database/supabase-server";
import { getWorkspaceId, getDraft, updateDraft } from "@/lib/database/repositories";
import { saveDraftSchema } from "@/lib/schemas/communication";
import { withErrorHandling } from "@/lib/errors";

export const PATCH = withErrorHandling(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUserApi();
    const { id: draftId } = await params;

    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: { code: "internal_error", message: "Supabase is not configured" } }, { status: 500 });
    }
    const workspaceId = await getWorkspaceId(supabase, user.id);

    const input = saveDraftSchema.parse(await request.json());
    await getDraft(supabase, workspaceId, draftId);
    const updated = await updateDraft(supabase, workspaceId, draftId, input);

    return NextResponse.json({ draftId: updated.id, content: updated.content, status: updated.status });
  },
);
