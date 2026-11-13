export interface ParsedMessage {
  direction: "inbound" | "outbound";
  senderName: string | null;
  senderEmail: string | null;
  sentAt: string | null;
  body: string;
}

const FROM_LINE = /^From:\s*(.+)$/im;
const SENT_LINE = /^(?:Sent|Date):\s*(.+)$/im;
const QUOTE_MARKER = /^On .+, .+ wrote:$/im;

function extractEmail(fromValue: string): { name: string | null; email: string | null } {
  const bracketed = fromValue.match(/<([^>]+)>/);
  const email = bracketed?.[1]?.trim() ?? (fromValue.includes("@") ? fromValue.trim() : null);
  const name = bracketed ? fromValue.slice(0, fromValue.indexOf("<")).trim() || null : null;
  return { name, email };
}

/**
 * Heuristic parser for pasted email threads. Splits on "From:" header lines,
 * extracts sender/date headers, and strips trailing quote markers.
 * Limitation: an email body containing a line starting with "From:" will be
 * split incorrectly; acceptable for MVP manual import.
 */
export function parseThread(threadText: string, ownerEmail?: string): ParsedMessage[] {
  const normalized = threadText.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const boundaryIndexes: number[] = [];
  const boundaryRegex = /^From:.*$/gm;
  let match: RegExpExecArray | null;
  while ((match = boundaryRegex.exec(normalized)) !== null) {
    boundaryIndexes.push(match.index);
  }

  const segments =
    boundaryIndexes.length === 0
      ? [normalized]
      : boundaryIndexes.map((start, i) => {
          const end = i + 1 < boundaryIndexes.length ? boundaryIndexes[i + 1] : normalized.length;
          return normalized.slice(start, end);
        });

  const messages: ParsedMessage[] = [];
  for (const segment of segments) {
    const lines = segment.split("\n");
    const fromMatch = segment.match(FROM_LINE);
    const sentMatch = segment.match(SENT_LINE);

    let bodyStart = 0;
    // Skip the From:/Sent:/Subject:/To: header block.
    while (
      bodyStart < lines.length &&
      (/^(From|Sent|Date|To|Subject|Cc):\s*/i.test(lines[bodyStart]) || lines[bodyStart].trim() === "")
    ) {
      bodyStart += 1;
    }

    const body = lines
      .slice(bodyStart)
      .join("\n")
      .replace(QUOTE_MARKER, "")
      .trim();

    if (!body) continue;

    const { name, email } = fromMatch ? extractEmail(fromMatch[1]) : { name: null, email: null };
    const direction =
      ownerEmail && email && email.toLowerCase() === ownerEmail.toLowerCase() ? "outbound" : "inbound";

    messages.push({
      direction,
      senderName: name,
      senderEmail: email,
      sentAt: sentMatch ? parseDateOrNull(sentMatch[1]) : null,
      body,
    });
  }

  return messages;
}

function parseDateOrNull(value: string): string | null {
  const date = new Date(value.trim());
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function firstSender(thread: ParsedMessage[]): { name: string | null; email: string | null } {
  const firstInbound = thread.find((m) => m.direction === "inbound") ?? thread[0];
  return { name: firstInbound?.senderName ?? null, email: firstInbound?.senderEmail ?? null };
}
