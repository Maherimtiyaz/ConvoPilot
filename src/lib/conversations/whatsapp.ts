/**
 * WhatsApp "Export chat" text files (iPhone and Android formats). Pure and dependency-free.
 *
 * WhatsApp has no API for reading a person's own chats, so the supported route is the app's own
 * Export chat → Without media, which produces a .txt file the user then uploads (or pastes).
 * Like every import, the content is untrusted DATA: never executed, rendered or followed.
 *
 * Formats (spaces may be U+202F / U+00A0 and lines may start with U+200E):
 *   iPhone:  [12/03/2026, 09:14:05] Priya Shah: text
 *   Android: 12/03/2026, 09:14 - Priya Shah: text      3/12/26, 9:14 AM - Priya Shah: text
 * Lines without a timestamp continue the previous message. Lines without "Name: " after the
 * timestamp, and iPhone lines marked with U+200E, are system notices (encryption notice, group
 * changes, media placeholders) and are skipped.
 */
import type { ParsedMessage } from "./parse";

const STAMP = String.raw`(\d{1,2})[./-](\d{1,2})[./-](\d{2,4}),?\s+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*([AaPp]\.?\s?[Mm]\.?)?`;
const IOS_LINE = new RegExp(String.raw`^\[${STAMP}\]\s*(.*)$`);
const ANDROID_LINE = new RegExp(String.raw`^${STAMP}\s+[-–]\s+(.*)$`);

/** Media placeholders and deletion notices carry no text worth importing. */
const SKIP_BODY =
  /^(?:<?(?:Media omitted|image omitted|video omitted|audio omitted|sticker omitted|GIF omitted|document omitted|Contact card omitted)>?|<attached: [^>]*>|This message was deleted\.?|You deleted this message\.?|Waiting for this message.*|Messages and calls are end-to-end encrypted.*|Missed (?:voice|video) call.*|null)$/i;
/** iPhone exports mark system notices and placeholders with an invisible U+200E after "Name: ". */
const IOS_SYSTEM = /^\u200e?\[[^\]]{6,40}\][^:]{1,100}: \u200e/;
const EDITED = /\s*<This message was edited>\s*$/i;

interface RawLine {
  a: number;
  b: number;
  year: number;
  hour: number;
  minute: number;
  second: number;
  meridiem: "am" | "pm" | null;
  rest: string;
}

/** Removes invisible direction marks and turns special spaces into ordinary ones. */
function clean(line: string): string {
  return line.replace(/[‎‏‪-‮⁦-⁩]/g, "").replace(/[  ]/g, " ");
}

function matchLine(line: string): RawLine | null {
  const m = IOS_LINE.exec(line) ?? ANDROID_LINE.exec(line);
  if (!m) return null;
  const year = Number(m[3]);
  const meridiem = m[7] ? (m[7].toLowerCase().startsWith("p") ? "pm" : "am") : null;
  return {
    a: Number(m[1]),
    b: Number(m[2]),
    year: year < 100 ? 2000 + year : year,
    hour: Number(m[4]),
    minute: Number(m[5]),
    second: m[6] ? Number(m[6]) : 0,
    meridiem,
    rest: m[8],
  };
}

/** True when the text looks like a WhatsApp export: most early lines start with a timestamp. */
export function isWhatsAppExport(text: string): boolean {
  const lines = text
    .split("\n")
    .map(clean)
    .filter((l) => l.trim())
    .slice(0, 25);
  if (lines.length === 0) return false;
  const stamped = lines.filter((l) => matchLine(l) !== null).length;
  return matchLine(lines[0]) !== null && stamped >= Math.min(2, lines.length) && stamped >= lines.length * 0.3;
}

/** "WhatsApp Chat with Priya Shah.txt" → "WhatsApp chat with Priya Shah". */
export function whatsAppSubject(fileName: string | null): string | null {
  if (!fileName) return null;
  const m = /^WhatsApp Chat (?:with|-)\s*(.+?)(?:\.txt)?$/i.exec(fileName.trim());
  return m ? `WhatsApp chat with ${m[1].trim()}`.slice(0, 300) : null;
}

/**
 * Splits the export into messages, oldest first. Times are the phone's local wall-clock time
 * (the export has no time zone); they are returned as `YYYY-MM-DDTHH:MM:SS` without a zone and
 * converted with the workspace time zone by the caller (`wallTimeToUtc`).
 *
 * Day/month order is not stated in the file: a first number above 12 means day first, a second
 * number above 12 means month first; otherwise 12-hour times (AM/PM) suggest month first (US
 * phones) and 24-hour times day first.
 */
export function parseWhatsAppText(text: string): ParsedMessage[] {
  const blocks: { stamp: RawLine; sender: string; lines: string[] }[] = [];
  let current: { stamp: RawLine; sender: string; lines: string[] } | null = null;
  const stamps: RawLine[] = [];

  for (const raw of text.split("\n")) {
    const line = clean(raw);
    const stamp = matchLine(line);
    if (stamp) {
      stamps.push(stamp);
      const sep = stamp.rest.indexOf(": ");
      if (sep <= 0 || sep > 100 || IOS_SYSTEM.test(raw)) {
        current = null; // system notice: skip it and anything continuing it
        continue;
      }
      current = { stamp, sender: stamp.rest.slice(0, sep).trim(), lines: [stamp.rest.slice(sep + 2)] };
      blocks.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }

  const dayFirst = stamps.some((s) => s.a > 12) ? true : stamps.some((s) => s.b > 12) ? false : !stamps.some((s) => s.meridiem);

  return blocks
    .map((b) => {
      const body = b.lines.join("\n").replace(EDITED, "").trim();
      return { senderName: b.sender.slice(0, 200) || null, senderEmail: null, sentAt: wallTime(b.stamp, dayFirst), body };
    })
    .filter((m) => m.body && !SKIP_BODY.test(m.body));
}

function wallTime(s: RawLine, dayFirst: boolean): string | null {
  const day = dayFirst ? s.a : s.b;
  const month = dayFirst ? s.b : s.a;
  let hour = s.hour;
  if (s.meridiem === "pm" && hour < 12) hour += 12;
  if (s.meridiem === "am" && hour === 12) hour = 0;
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || s.minute > 59 || s.second > 59) return null;
  const check = new Date(Date.UTC(s.year, month - 1, day));
  if (check.getUTCDate() !== day) return null; // e.g. 31/02
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(s.year, 4)}-${p(month)}-${p(day)}T${p(hour)}:${p(s.minute)}:${p(s.second)}`;
}

/**
 * Converts a zone-less wall-clock time ("2026-03-12T09:14:00") in `timeZone` to an ISO UTC
 * instant. Unknown zones fall back to UTC. Uses only the built-in time zone database.
 */
export function wallTimeToUtc(wall: string, timeZone: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})$/.exec(wall);
  if (!m) return null;
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  let offset: number;
  try {
    offset = zoneOffset(asUtc, timeZone);
    offset = zoneOffset(asUtc - offset, timeZone); // second pass settles daylight-saving edges
  } catch {
    offset = 0;
  }
  return new Date(asUtc - offset).toISOString();
}

/** Milliseconds the zone is ahead of UTC at the given instant. */
function zoneOffset(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const local = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return local - Math.floor(instant / 1000) * 1000;
}
