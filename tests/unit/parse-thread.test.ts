import { describe, expect, it } from "vitest";
import { firstSender, parseThread } from "@/lib/email/parse-thread";

const THREAD = `From: Sahin <sahin@startup.io>
Sent: Mon, 10 Mar 2025 09:00:00 +0000
Subject: Feedback

Hi Mahek, the resume looks good but the projects section needs tightening.

On Mon, 10 Mar 2025, Mahek wrote:

Thanks Sahin, I'll rework it.

From: Sahin <sahin@startup.io>
Sent: Tue, 11 Mar 2025 10:00:00 +0000

Also, could you send the updated version by Friday?`;

describe("parseThread", () => {
  it("splits a thread on From: boundaries", () => {
    const messages = parseThread(THREAD, "mahek@me.com");
    expect(messages).toHaveLength(2);
  });

  it("extracts sender name and email", () => {
    const [first] = parseThread(THREAD, "mahek@me.com");
    expect(first.senderName).toBe("Sahin");
    expect(first.senderEmail).toBe("sahin@startup.io");
  });

  it("classifies direction using the owner email", () => {
    const messages = parseThread(THREAD, "mahek@me.com");
    expect(messages[0].direction).toBe("inbound");
    expect(messages[1].direction).toBe("inbound");
  });

  it("marks the owner's own messages as outbound", () => {
    const thread = `From: Mahek <mahek@me.com>\n\nThanks for the update.\n\nFrom: Ana <ana@x.com>\n\nGreat, talk soon.`;
    const messages = parseThread(thread, "mahek@me.com");
    expect(messages[0].direction).toBe("outbound");
    expect(messages[1].direction).toBe("inbound");
  });

  it("parses sent dates into ISO strings", () => {
    const [first] = parseThread(THREAD, "mahek@me.com");
    expect(first.sentAt).toBe("2025-03-10T09:00:00.000Z");
  });

  it("strips trailing quote markers", () => {
    const [first] = parseThread(THREAD, "mahek@me.com");
    expect(first.body).not.toContain("wrote:");
    expect(first.body).toContain("projects section needs tightening");
  });

  it("falls back to a single message when there are no headers", () => {
    const messages = parseThread("Just a plain pasted message body with enough text in it to parse.");
    expect(messages).toHaveLength(1);
    expect(messages[0].direction).toBe("inbound");
  });

  it("returns empty for empty input", () => {
    expect(parseThread("   ")).toEqual([]);
  });
});

describe("firstSender", () => {
  it("returns the first inbound sender", () => {
    const messages = parseThread(THREAD, "mahek@me.com");
    expect(firstSender(messages).email).toBe("sahin@startup.io");
  });
});
