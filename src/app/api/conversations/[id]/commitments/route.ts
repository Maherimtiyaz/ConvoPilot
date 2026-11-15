import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { createClient } from "@/lib/database/supabase-server";
import {
  getWorkspaceId,
  getConversationWithMessages,
  createCommitmentProposal,
  logAudit,
} from "@/lib/database/repositories";
import { resolveProvider } from "@/lib/ai/providers";
import { extractCommitments } from "@/lib/ai/orchestrator/productivity";
import { extractCommitmentsRequestSchema } from "@/lib/schemas/productivity";
import { withErrorHandling, AppError } from "@/lib/errors";

export const POST = withErrorHandling(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireUserApi();
    const { id: conversationId } = await params;

    const supabase = await createClient();
    if (!supabase) throw new AppError("internal_error", "Supabase is not configured");
    const workspaceId = await getWorkspaceId(supabase, user.id);

    const provider = resolveProvider();
    if (!provider) throw new AppError("internal_error", "Application is not configured");

    const input = extractCommitmentsRequestSchema.parse(await request.json());
    if (input.conversationId !== conversationId) {
      return NextResponse.json(
        { error: { code: "bad_request", message: "Conversation id mismatch" } },
        { status: 400 },
      );
    }

    const { conversation, messages } = await getConversationWithMessages(
      supabase,
      workspaceId,
      conversationId,
    );
    const threadText = messages
      .map((m) => `From: ${m.sender_name ?? "Unknown"}\n\n${m.body}`)
      .join("\n\n---\n\n");

    const result = await extractCommitments(provider, threadText, {
      conversationDate: conversation.last_message_at,
    });

    const firstInboundId = messages.find((m) => m.direction === "inbound")?.id ?? null;
    const saved = [];
    for (const proposal of result.proposals) {
      saved.push(
        await createCommitmentProposal(supabase, workspaceId, {
          conversation_id: conversationId,
          contact_id: conversation.contact_id,
          owner: proposal.owner,
          description: proposal.description,
          due_date: proposal.dueDate,
          confidence: proposal.confidence,
          source_message_id: firstInboundId,
          source_excerpt: proposal.sourceExcerpt,
          model_metadata: {
            provider: result.providerId,
            model: result.model,
            prompt_version: result.promptVersion,
            due_date_ambiguous: proposal.dueDateAmbiguous,
          },
        }),
      );
    }

    await logAudit(supabase, workspaceId, {
      actor: user.id,
      action: "commitments.extracted",
      target_type: "conversation",
      target_id: conversationId,
      metadata: { count: saved.length },
    });

    return NextResponse.json(
      { proposals: saved },
      { status: 201 },
    );
  },
);
