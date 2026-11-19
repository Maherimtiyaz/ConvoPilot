import { NextResponse } from "next/server";
import { requireUserApi } from "@/lib/auth";
import { createClient } from "@/lib/database/supabase-server";
import { getWorkspaceId, createConversation, insertMessages, findContactByEmail, createContact } from "@/lib/database/repositories";
import { parseThread, firstSender } from "@/lib/email/parse-thread";
import { importThreadSchema } from "@/lib/schemas/communication";
import { withErrorHandling } from "@/lib/errors";

export const POST = withErrorHandling(async (request: Request) => {
  const user = await requireUserApi();
  const body = importThreadSchema.parse(await request.json());

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: { code: "internal_error", message: "Supabase is not configured" } }, { status: 500 });
  }
  const workspaceId = await getWorkspaceId(supabase, user.id);

  const parsed = parseThread(body.threadText, user.email);
  if (parsed.length === 0) {
    return NextResponse.json(
      { error: { code: "bad_request", message: "Could not parse any messages from the pasted text" } },
      { status: 400 },
    );
  }

  const sender = firstSender(parsed);
  let contactId: string | null = null;

  if (body.saveSender) {
    const email = body.senderEmail || sender.email;
    if (!email) {
      return NextResponse.json(
        { error: { code: "bad_request", message: "No sender email found — enter it manually to save the contact" } },
        { status: 400 },
      );
    }
    const existing = await findContactByEmail(supabase, workspaceId, email);
    if (existing) {
      contactId = existing.id;
    } else {
      const contact = await createContact(supabase, workspaceId, {
        full_name: body.senderName || sender.name || email.split("@")[0],
        email,
      });
      contactId = contact.id;
    }
  }

  const conversation = await createConversation(supabase, workspaceId, {
    contact_id: contactId,
    subject: body.subject ?? null,
    source_type: "paste",
  });

  const stored = await insertMessages(
    supabase,
    workspaceId,
    conversation.id,
    parsed.map((m) => ({
      direction: m.direction,
      sender_name: m.senderName,
      sender_email: m.senderEmail,
      body: m.body,
      sent_at: m.sentAt,
      provenance: "paste" as const,
    })),
  );

  const lastMessageAt = parsed.reduce<string | null>((acc, m) => m.sentAt ?? acc, null);
  if (lastMessageAt && contactId) {
    await supabase
      .from("contacts")
      .update({ last_interaction_at: lastMessageAt })
      .eq("workspace_id", workspaceId)
      .eq("id", contactId);
  }

  return NextResponse.json(
    {
      conversationId: conversation.id,
      messageCount: stored.length,
      contactId,
      sender: { name: sender.name, email: sender.email },
    },
    { status: 201 },
  );
});
