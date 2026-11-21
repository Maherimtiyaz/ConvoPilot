import { isWhatsAppExport, parseWhatsAppText, whatsAppSubject } from "./whatsapp";

/**
 * Turns pasted text or an uploaded .txt / .md / .eml file into an ordered list of messages.
 * WhatsApp "Export chat" text (pasted or as .txt) is recognised automatically (./whatsapp.ts).
 * Pure and dependency-free. Imported content is untrusted DATA: it is never executed, rendered as
 * HTML or followed as instructions. Limits (engineering defaults, ARCHITECTURE pending item):
 * 200,000 characters per import, 50 messages, 50,000 characters per message, 750 KB per file.
 */
export const LIMITS = { maxChars: 200_000, maxMessages: 50, maxMessageChars: 50_000, maxFileBytes: 750_000 } as const;

export interface ParsedMessage {
  senderName: string | null;
  senderEmail: string | null;
  sentAt: string | null; // ISO 8601
  body: string;
}

export interface ParsedThread {
  subject: string | null;
  messages: ParsedMessage[]; // oldest first
  /** WhatsApp exports: `sentAt` is the phone's wall-clock time without a zone (convert before storing). */
  localTimes?: boolean;
  /** WhatsApp exports keep the newest messages; this many older ones were left out. */
  omittedOlder?: number;
}

export type ParseError = "empty" | "too_long" | "too_many_messages" | "unsupported_file" | "file_too_large" | "invalid_text";

export type ParseResult = { ok: true; thread: ParsedThread } | { ok: false; error: ParseError };

// ---------------------------------------------------------------- entry points
/** NUL bytes mean binary or corrupted content; reject it with a typed error (SECURITY §10.1). */
const hasNul = (text: string) => text.includes("\u0000");

export function parsePastedText(text: string): ParseResult {
  if (text.length > LIMITS.maxChars) return { ok: false, error: "too_long" };
  if (hasNul(text)) return { ok: false, error: "invalid_text" };
  const normalised = normaliseNewlines(text);
  if (isWhatsAppExport(normalised)) return finishWhatsApp(parseWhatsAppText(normalised), null);
  return finish(splitThread(normalised), null);
}

export function parseFile(name: string, bytes: Uint8Array): ParseResult {
  if (bytes.byteLength > LIMITS.maxFileBytes) return { ok: false, error: "file_too_large" };
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "txt" || ext === "md") {
    const text = normaliseNewlines(decode(bytes, "utf-8"));
    // WhatsApp exports are often longer than a pasted thread; the 750 KB file limit still applies.
    if (!hasNul(text) && isWhatsAppExport(text)) return finishWhatsApp(parseWhatsAppText(text), whatsAppSubject(name));
    return parsePastedText(text);
  }
  if (ext === "eml") {
    const raw = decode(bytes, "utf-8");
    if (raw.length > LIMITS.maxChars * 2) return { ok: false, error: "too_long" };
    if (hasNul(raw)) return { ok: false, error: "invalid_text" };
    return parseEml(raw);
  }
  return { ok: false, error: "unsupported_file" };
}

export function parseEml(raw: string): ParseResult {
  const { headers, body } = splitHeaders(normaliseNewlines(raw));
  const text = extractText(headers, body);
  const from = parseAddress(headers.get("from") ?? "");
  const sentAt = parseDate(headers.get("date") ?? null);
  const subject = decodeHeader(headers.get("subject") ?? "").trim() || null;
  // The newest message is the email itself; quoted history below it becomes earlier messages.
  const segments = splitThread(text);
  if (segments.length > 0) {
    const newest = segments[segments.length - 1];
    segments[segments.length - 1] = { ...newest, senderName: newest.senderName ?? from.name, senderEmail: newest.senderEmail ?? from.email, sentAt: newest.sentAt ?? sentAt };
  }
  return finish(segments, subject);
}

function finish(messages: ParsedMessage[], subject: string | null): ParseResult {
  const cleaned = messages
    .map((m) => ({ ...m, body: m.body.replace(/^\s*\n/, "").replace(/\s+$/, "") }))
    .filter((m) => m.body.trim().length > 0);
  if (cleaned.length === 0) return { ok: false, error: "empty" };
  if (cleaned.length > LIMITS.maxMessages) return { ok: false, error: "too_many_messages" };
  if (cleaned.some((m) => m.body.length > LIMITS.maxMessageChars)) return { ok: false, error: "too_long" };
  return { ok: true, thread: { subject, messages: cleaned } };
}

/** Keeps the newest messages of a long chat, then applies the usual size limits. */
function finishWhatsApp(messages: ParsedMessage[], subject: string | null): ParseResult {
  if (messages.length === 0) return { ok: false, error: "empty" };
  const kept = messages.slice(-LIMITS.maxMessages);
  if (kept.some((m) => m.body.length > LIMITS.maxMessageChars)) return { ok: false, error: "too_long" };
  if (kept.reduce((n, m) => n + m.body.length, 0) > LIMITS.maxChars) return { ok: false, error: "too_long" };
  // iPhone exports are named "_chat.txt", so fall back to the people in the chat.
  const people = [...new Set(kept.map((m) => m.senderName).filter((n): n is string => Boolean(n)))];
  const fallback = people.length ? `WhatsApp chat: ${people.slice(0, 3).join(", ")}${people.length > 3 ? "…" : ""}` : "WhatsApp chat";
  return { ok: true, thread: { subject: subject ?? fallback.slice(0, 300), messages: kept, localTimes: true, omittedOlder: messages.length - kept.length } };
}

// ---------------------------------------------------------------- thread splitting
const GMAIL_QUOTE = /^On (.{3,200}?)(?:,| at) ?(.*?)\s*wrote:\s*$/;
const ORIGINAL = /^-{2,}\s*(?:Original Message|Forwarded message)\s*-{2,}\s*$/i;
const HEADER_LINE = /^(From|Sent|Date|To|Cc|Subject):\s*(.*)$/i;

/**
 * Splits an email body that contains replies into separate messages, oldest first.
 * Recognises Gmail-style "On …, X wrote:" and Outlook-style "From: / Sent:" header blocks.
 */
export function splitThread(text: string): ParsedMessage[] {
  const lines = text.split("\n");
  const blocks: { header: Record<string, string>; lines: string[] }[] = [{ header: {}, lines: [] }];
  for (let i = 0; i < lines.length; i++) {
    const line = stripQuote(lines[i]);
    const gmail = GMAIL_QUOTE.exec(line.trim());
    if (gmail) {
      blocks.push({ header: { gmail: line.trim() }, lines: [] });
      continue;
    }
    const startsHeader = ORIGINAL.test(line.trim()) || (/^From:\s/i.test(line.trim()) && lines.slice(i + 1, i + 5).some((l) => /^(Sent|Date):\s/i.test(stripQuote(l).trim())));
    if (startsHeader) {
      const header: Record<string, string> = {};
      let j = ORIGINAL.test(line.trim()) ? i + 1 : i;
      for (; j < lines.length; j++) {
        const h = HEADER_LINE.exec(stripQuote(lines[j]).trim());
        if (!h) break;
        header[h[1].toLowerCase()] = h[2];
      }
      blocks.push({ header, lines: [] });
      i = j - 1;
      continue;
    }
    blocks[blocks.length - 1].lines.push(line);
  }

  const messages = blocks.map((b) => {
    if (b.header.gmail) {
      const addr = parseAddress(b.header.gmail.replace(/^On .*?,(?=[^,]*wrote:)/, "").replace(/wrote:\s*$/, ""));
      const date = parseDate(b.header.gmail.replace(/^On /, "").replace(/,[^,]*wrote:\s*$/, ""));
      return { senderName: addr.name, senderEmail: addr.email, sentAt: date, body: b.lines.join("\n") };
    }
    const addr = parseAddress(b.header.from ?? "");
    return { senderName: addr.name, senderEmail: addr.email, sentAt: parseDate(b.header.sent ?? b.header.date ?? null), body: b.lines.join("\n") };
  });
  // Email clients put the newest message on top.
  return messages.reverse();
}

function stripQuote(line: string): string {
  return line.replace(/^(?:\s*>)+ ?/, "");
}

// ---------------------------------------------------------------- headers and MIME
function splitHeaders(raw: string): { headers: Map<string, string>; body: string } {
  const end = raw.indexOf("\n\n");
  const head = end === -1 ? raw : raw.slice(0, end);
  const body = end === -1 ? "" : raw.slice(end + 2);
  const headers = new Map<string, string>();
  let current: string | null = null;
  for (const line of head.split("\n")) {
    if (/^[ \t]/.test(line) && current) {
      headers.set(current, `${headers.get(current)} ${line.trim()}`);
      continue;
    }
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    current = line.slice(0, idx).trim().toLowerCase();
    if (!headers.has(current)) headers.set(current, line.slice(idx + 1).trim());
  }
  return { headers, body };
}

function extractText(headers: Map<string, string>, body: string, depth = 0): string {
  const type = (headers.get("content-type") ?? "text/plain").toLowerCase();
  if (type.startsWith("multipart/") && depth < 5) {
    const boundary = /boundary="?([^";]+)"?/i.exec(headers.get("content-type") ?? "")?.[1];
    if (!boundary) return "";
    const parts = body.split(`--${boundary}`).slice(1).filter((p) => !p.startsWith("--"));
    const decoded = parts.map((p) => {
      const { headers: h, body: b } = splitHeaders(p.replace(/^\n/, ""));
      return { type: (h.get("content-type") ?? "text/plain").toLowerCase(), disposition: (h.get("content-disposition") ?? "").toLowerCase(), h, b };
    }).filter((p) => !p.disposition.startsWith("attachment"));
    const plain = decoded.find((p) => p.type.startsWith("text/plain"));
    const nested = decoded.find((p) => p.type.startsWith("multipart/"));
    const html = decoded.find((p) => p.type.startsWith("text/html"));
    const chosen = plain ?? nested ?? html;
    return chosen ? extractText(chosen.h, chosen.b, depth + 1) : "";
  }
  const charset = /charset="?([^";]+)"?/i.exec(headers.get("content-type") ?? "")?.[1] ?? "utf-8";
  const encoding = (headers.get("content-transfer-encoding") ?? "").toLowerCase();
  let bytes: Uint8Array;
  if (encoding === "base64") bytes = base64ToBytes(body.replace(/\s+/g, ""));
  else if (encoding === "quoted-printable") bytes = quotedPrintableToBytes(body);
  else bytes = new TextEncoder().encode(body);
  const text = decode(bytes, charset);
  return type.startsWith("text/html") ? htmlToText(text) : text;
}

function quotedPrintableToBytes(input: string): Uint8Array {
  const s = input.replace(/=\n/g, "");
  const out: number[] = [];
  const enc = new TextEncoder();
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) {
      out.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      out.push(...enc.encode(s[i]));
    }
  }
  return new Uint8Array(out);
}

function base64ToBytes(b64: string): Uint8Array {
  try {
    return new Uint8Array(Buffer.from(b64, "base64"));
  } catch {
    return new Uint8Array();
  }
}

function decode(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset.toLowerCase(), { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

/** RFC 2047 encoded words (=?utf-8?B?…?= / =?utf-8?Q?…?=). */
function decodeHeader(value: string): string {
  return value.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, charset: string, enc: string, data: string) => {
    const bytes = enc.toUpperCase() === "B" ? base64ToBytes(data) : quotedPrintableToBytes(data.replace(/_/g, " "));
    return decode(bytes, charset);
  });
}

/** Plain text from HTML. The HTML is never rendered; tags, scripts and styles are dropped. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n");
}

export function parseAddress(value: string): { name: string | null; email: string | null } {
  const v = decodeHeader(value).trim();
  const angle = /^(.*?)<\s*([^<>\s@]+@[^<>\s@]+)\s*>/.exec(v);
  if (angle) return { name: angle[1].replace(/^["'\s]+|["'\s]+$/g, "") || null, email: angle[2].toLowerCase() };
  const bare = /([^\s<>"]+@[^\s<>"]+\.[A-Za-z]{2,})/.exec(v);
  if (bare) return { name: v.replace(bare[1], "").replace(/^["'\s(]+|["'\s)]+$/g, "") || null, email: bare[1].toLowerCase() };
  return { name: v.replace(/^["'\s]+|["'\s]+$/g, "").slice(0, 200) || null, email: null };
}

function parseDate(value: string | null): string | null {
  if (!value) return null;
  const t = Date.parse(value.replace(/\s+at\s+/i, " "));
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function normaliseNewlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}
