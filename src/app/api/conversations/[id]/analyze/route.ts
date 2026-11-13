import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { createClient } from "@/lib/database/supabase-server";
import { getWorkspaceId, getConversationWithMessages, saveClassification } from "@/lib/database/repositories";
import { resolveProvider } from "@/lib/ai/providers";
import { analyzeEmail } from "@/lib/ai/orchestrator/communication";
import { withErrorHandling, AppError } from "@/lib/errors";

export const POST = withErrorHandling(
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUserApi();
    const { id: conversationId } = await params;

    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: { code: "internal_error", message: "Supabase is not configured" } }, { status: 500 });
    }
    const workspaceId = await getWorkspaceId(supabase, user.id);

    const provider = resolveProvider();
    if (!provider) {
      throw new AppError("internal_error", "Application is not configured");
    }

    const { messages } = await getConversationWithMessages(supabase, workspaceId, conversationId);
    const threadText = messages
      .map((m) => `From: ${m.sender_name ?? "Unknown"}\n\n${m.body}`)
      .join("\n\n---\n\n");

    const result = await analyzeEmail(provider, threadText);

    const firstInbound = messages.find((m) => m.direction === "inbound");
    if (firstInbound) {
      await saveClassification(supabase, workspaceId, {
        message_id: firstInbound.id,
        intent: result.analysis.intent,
        urgency: result.analysis.urgency,
        summary: result.analysis.summary,
        expected_response: result.analysis.expectedResponse,
        confidence: result.analysis.confidence,
        model_metadata: {
          provider: result.providerId,
          model: result.model,
          prompt_version: result.promptVersion,
        },
      });
    }

    return NextResponse.json({
      conversationId,
      analysis: result.analysis,
      promptVersion: result.promptVersion,
    });
  },
);
