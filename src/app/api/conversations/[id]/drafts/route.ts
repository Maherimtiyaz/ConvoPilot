import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { createClient } from "@/lib/database/supabase-server";
import {
  getWorkspaceId,
  getConversationWithMessages,
  createDraft,
  findContactByEmail,
} from "@/lib/database/repositories";
import { resolveProvider } from "@/lib/ai/providers";
import { generateReply } from "@/lib/ai/orchestrator/communication";
import { draftRequestSchema } from "@/lib/schemas/communication";
import { withErrorHandling, AppError } from "@/lib/errors";

export const POST = withErrorHandling(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
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

    const input = draftRequestSchema.parse({ ...(await request.json()), conversationId });

    const { conversation, messages } = await getConversationWithMessages(supabase, workspaceId, conversationId);
    const threadText = messages
      .map((m) => `From: ${m.sender_name ?? "Unknown"}\n\n${m.body}`)
      .join("\n\n---\n\n");

    let contactContext: string | undefined;
    if (conversation.contact_id) {
      const { data: contact } = await supabase
        .from("contacts")
        .select("full_name, role, relationship_context")
        .eq("workspace_id", workspaceId)
        .eq("id", conversation.contact_id)
        .maybeSingle<{ full_name: string; role: string | null; relationship_context: string | null }>();
      if (contact) {
        contactContext = [
          `Name: ${contact.full_name}`,
          contact.role ? `Role: ${contact.role}` : null,
          contact.relationship_context ? `Context: ${contact.relationship_context}` : null,
        ]
          .filter(Boolean)
          .join("\n");
      }
    }

    const result = await generateReply(provider, {
      threadText,
      analysis: null,
      intendedOutcome: input.intendedOutcome,
      tone: input.tone,
      length: input.length,
      contactContext,
    });

    const senderEmail = messages.find((m) => m.direction === "inbound")?.sender_email ?? null;
    const contact = senderEmail ? await findContactByEmail(supabase, workspaceId, senderEmail) : null;

    const draft = await createDraft(supabase, workspaceId, {
      conversation_id: conversationId,
      contact_id: conversation.contact_id ?? contact?.id ?? null,
      content: result.content,
      tone: input.tone,
      model_metadata: {
        provider: result.providerId,
        model: result.model,
        prompt_version: result.promptVersion,
        length: input.length,
      },
    });

    return NextResponse.json(
      { draftId: draft.id, content: draft.content, revision: 0 },
      { status: 201 },
    );
  },
);
