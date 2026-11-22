import { wrapUntrusted } from "../untrusted";

/** A stored message as given to a workflow (already loaded through RLS, never deleted). */
export interface ThreadMessage {
  id: string;
  workspaceId: string;
  position: number;
  direction: "inbound" | "outbound" | "unknown";
  senderName: string | null;
  senderEmail: string | null;
  sentAt: string | null;
  body: string;
}

export interface ThreadOwner {
  name: string | null;
  email: string | null;
  /** Names the user appears under in chat exports (Settings); untrusted user-entered text. */
  chatNames?: string[];
}

/** Numbered, delimited thread text: the model cites messages as [n]. */
export function renderThread(subject: string, messages: ThreadMessage[], nonce: string): string {
  const header = `Conversation subject (from the import, untrusted): ${subject.replace(/[\r\n]+/g, " ").slice(0, 300)}`;
  const blocks = messages.map((m) => {
    const who = [m.senderName, m.senderEmail ? `<${m.senderEmail}>` : null].filter(Boolean).join(" ") || "unknown sender";
    const side = m.direction === "outbound" ? "sent by the user" : m.direction === "inbound" ? "received by the user" : "sender unclear";
    return {
      label: `message ${m.position}`,
      id: String(m.position),
      content: `[${m.position}] From: ${who} (${side})${m.sentAt ? ` · ${m.sentAt}` : ""}\n${m.body}`,
    };
  });
  return `${header}\n\n${wrapUntrusted(blocks, nonce).text}`;
}

export function describeOwner(owner: ThreadOwner): string {
  const base = owner.email ? `The user is ${owner.name ?? "the account owner"} <${owner.email}>.` : "The user is the account owner.";
  const names = (owner.chatNames ?? []).map((n) => JSON.stringify(n.replace(/[\r\n]+/g, " ").slice(0, 100))).slice(0, 5);
  return names.length ? `${base} In chat exports the user appears as ${names.join(", ")}.` : base;
}

/** Messages with no email whose sender name is one of the user's chat names were sent by the user. */
export function resolveDirections(messages: ThreadMessage[], chatNames: string[]): ThreadMessage[] {
  const mine = new Set(chatNames.map((n) => n.trim().toLowerCase()).filter(Boolean));
  if (mine.size === 0) return messages;
  return messages.map((m) =>
    m.direction === "unknown" && !m.senderEmail && m.senderName && mine.has(m.senderName.trim().toLowerCase()) ? { ...m, direction: "outbound" } : m,
  );
}
