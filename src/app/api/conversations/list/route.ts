import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { createClient } from "@/lib/database/supabase-server";
import { getWorkspaceId, listConversations } from "@/lib/database/repositories";
import { withErrorHandling, AppError } from "@/lib/errors";

export const GET = withErrorHandling(async () => {
  const user = await requireUserApi();
  const supabase = await createClient();
  if (!supabase) throw new AppError("internal_error", "Supabase is not configured");
  const workspaceId = await getWorkspaceId(supabase, user.id);

  const conversations = await listConversations(supabase, workspaceId);
  return NextResponse.json({ conversations });
});
