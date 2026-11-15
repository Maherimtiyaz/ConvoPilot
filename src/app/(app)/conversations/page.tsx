import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/database/supabase-server";
import { getWorkspaceId, listConversations } from "@/lib/database/repositories";
import { ConversationsList } from "@/components/conversations/conversations-list";

export default async function ConversationsPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const conversations = supabase
    ? await listConversations(supabase, await getWorkspaceId(supabase, user.id))
    : [];

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Conversations</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Stored email threads and messages, linked to contacts. Extract commitments from any conversation.
        </p>
      </header>

      <ConversationsList initialConversations={conversations} />
    </div>
  );
}
