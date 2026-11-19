"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

interface ConversationListItem {
  id: string;
  subject: string | null;
  source_type: string;
  last_message_at: string | null;
  created_at: string;
  contact_name: string | null;
  message_count: number;
}

export function ConversationsList({ initialConversations }: { initialConversations: ConversationListItem[] }) {
  const [conversations] = useState<ConversationListItem[]>(initialConversations);
  const [error, setError] = useState<string | null>(null);
  const [extractingId, setExtractingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);


  async function extractCommitments(conversationId: string) {
    setExtractingId(conversationId);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/conversations/${conversationId}/commitments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
      const body = (await res.json()) as { proposals?: unknown[]; error?: { message: string } };
      if (!res.ok) throw new Error(body.error?.message ?? "Extraction failed");
      const count = body.proposals?.length ?? 0;
      setNotice(
        count > 0
          ? `${count} commitment proposal${count === 1 ? "" : "s"} saved — review ${count === 1 ? "it" : "them"} in the Tasks approval queue.`
          : "No commitments found in this conversation.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setExtractingId(null);
    }
  }

  if (conversations.length === 0) {
    return (
      <EmptyState
        title="No conversations yet"
        description="Paste an email thread in the Communication Studio to store your first conversation."
      />
    );
  }

  return (
    <div className="space-y-3">
      {notice ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {conversations.map((c) => (
        <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-900">{c.subject ?? "(no subject)"}</p>
            <p className="text-xs text-zinc-500">
              {c.contact_name ?? "Unlinked"} · {c.message_count} message{c.message_count === 1 ? "" : "s"} · imported{" "}
              {new Date(c.created_at).toLocaleDateString()}
            </p>
          </div>
          <Badge>{c.source_type}</Badge>
          <Button size="sm" variant="outline" onClick={() => extractCommitments(c.id)} disabled={extractingId !== null}>
            {extractingId === c.id ? "Extracting…" : "Extract commitments"}
          </Button>
        </div>
      ))}
    </div>
  );
}
