import { describe, expect, it } from "vitest";

import { htmlToText, LIMITS, parseAddress, parseEml, parseFile, parsePastedText } from "@/lib/conversations/parse";

const GMAIL_THREAD = `Sounds good, I'll send it Friday.

Best,
Ada

On Thu, 12 Mar 2026 at 09:14, Priya Shah <priya@example.com> wrote:
> Thanks for the call today. Could you send the revised deck by Friday?
> We'd also like to know if the pilot can start in March.
`;

const OUTLOOK_THREAD = `Confirming March works for us.

From: Priya Shah <priya@example.com>
Sent: Thursday, March 12, 2026 9:14 AM
To: Ada <ada@example.com>
Subject: Pilot

Can the pilot start in March?`;

describe("parsePastedText", () => {
  it("splits a Gmail-style reply chain into messages, oldest first", () => {
    const r = parsePastedText(GMAIL_THREAD);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [first, second] = r.thread.messages;
    expect(r.thread.messages).toHaveLength(2);
    expect(first).toMatchObject({ senderName: "Priya Shah", senderEmail: "priya@example.com", sentAt: "2026-03-12T09:14:00.000Z" });
    expect(first.body).toBe("Thanks for the call today. Could you send the revised deck by Friday?\nWe'd also like to know if the pilot can start in March.");
    expect(second.body).toContain("I'll send it Friday");
    expect(second.senderEmail).toBeNull();
  });

  it("splits an Outlook-style header block", () => {
    const r = parsePastedText(OUTLOOK_THREAD);
    expect(r.ok && r.thread.messages.map((m) => m.body)).toEqual(["Can the pilot start in March?", "Confirming March works for us."]);
    expect(r.ok && r.thread.messages[0].senderEmail).toBe("priya@example.com");
  });

  it("keeps a single message as one message", () => {
    const r = parsePastedText("Hi, are we still on for Tuesday?");
    expect(r.ok && r.thread.messages).toHaveLength(1);
  });

  it("rejects empty and over-long input", () => {
    expect(parsePastedText("   \n  ")).toEqual({ ok: false, error: "empty" });
    expect(parsePastedText("x".repeat(LIMITS.maxChars + 1))).toEqual({ ok: false, error: "too_long" });
  });
});

describe("parseEml", () => {
  const EML = [
    "From: =?utf-8?Q?Priya_Shah?= <Priya@Example.com>",
    "To: ada@example.com",
    "Subject: =?utf-8?B?UGlsb3QgdGltaW5n?=",
    "Date: Thu, 12 Mar 2026 09:14:00 +0000",
    "MIME-Version: 1.0",
    'Content-Type: multipart/alternative; boundary="b1"',
    "",
    "--b1",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: quoted-printable",
    "",
    "Could you send the revised deck by Friday? Caf=C3=A9 next week=",
    " works too.",
    "--b1",
    "Content-Type: text/html; charset=utf-8",
    "",
    "<p>Ignored HTML</p>",
    "--b1--",
    "",
  ].join("\r\n");

  it("reads headers, prefers text/plain and decodes quoted-printable and encoded words", () => {
    const r = parseEml(EML);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.thread.subject).toBe("Pilot timing");
    expect(r.thread.messages).toEqual([
      { senderName: "Priya Shah", senderEmail: "priya@example.com", sentAt: "2026-03-12T09:14:00.000Z", body: "Could you send the revised deck by Friday? Café next week works too." },
    ]);
  });

  it("falls back to HTML converted to plain text, never rendered", () => {
    const html = ["From: x@example.com", "Content-Type: text/html", "", "<html><head><style>p{}</style></head><body><p>Hello <b>there</b></p><script>alert(1)</script><img src=\"https://tracker.example/x.png\"></body></html>"].join("\n");
    const r = parseEml(html);
    expect(r.ok && r.thread.messages[0].body).toBe("Hello there");
  });

  it("only accepts .txt, .md and .eml files within the size limit", () => {
    const bytes = new TextEncoder().encode("hello");
    expect(parseFile("notes.pdf", bytes)).toEqual({ ok: false, error: "unsupported_file" });
    expect(parseFile("big.txt", new Uint8Array(LIMITS.maxFileBytes + 1))).toEqual({ ok: false, error: "file_too_large" });
    expect(parseFile("t.MD", bytes).ok).toBe(true);
  });

  it("rejects binary content (NUL bytes) with a typed error", () => {
    expect(parsePastedText("hello\u0000world")).toEqual({ ok: false, error: "invalid_text" });
    expect(parseFile("notes.txt", new Uint8Array([104, 105, 0, 105]))).toEqual({ ok: false, error: "invalid_text" });
    expect(parseFile("mail.eml", new TextEncoder().encode("From: a@example.com\r\n\r\nhi\u0000"))).toEqual({ ok: false, error: "invalid_text" });
  });
});

describe("helpers", () => {
  it("parses addresses", () => {
    expect(parseAddress('"Shah, Priya" <priya@example.com>')).toEqual({ name: "Shah, Priya", email: "priya@example.com" });
    expect(parseAddress("priya@example.com")).toEqual({ name: null, email: "priya@example.com" });
    expect(parseAddress("Priya")).toEqual({ name: "Priya", email: null });
  });

  it("strips tags and decodes entities", () => {
    expect(htmlToText("a&amp;b<br>c &lt;d&gt;")).toBe("a&b\nc <d>");
  });
});
