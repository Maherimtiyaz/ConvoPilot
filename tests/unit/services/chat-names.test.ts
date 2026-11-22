import { describe, expect, it } from "vitest";

import { describeOwner, resolveDirections, type ThreadMessage } from "@/lib/ai/workflows/thread-input";
import { normaliseChatNames } from "@/lib/services/account";

const msg = (position: number, senderName: string | null, senderEmail: string | null = null, direction: ThreadMessage["direction"] = "unknown"): ThreadMessage => ({
  id: `m${position}`,
  workspaceId: "w",
  position,
  direction,
  senderName,
  senderEmail,
  sentAt: null,
  body: "synthetic",
});

describe("normaliseChatNames", () => {
  it("trims, collapses spaces, drops empties and case-insensitive duplicates", () => {
    expect(normaliseChatNames([" Ada  Example ", "", "ada example", "Ada"])).toEqual(["Ada Example", "Ada"]);
    expect(normaliseChatNames([])).toEqual([]);
  });

  it("refuses more than five names, over-long names and control characters", () => {
    expect(normaliseChatNames(["a", "b", "c", "d", "e", "f"])).toBeNull();
    expect(normaliseChatNames(["x".repeat(101)])).toBeNull();
    expect(normaliseChatNames(["Ada\u0007"])).toBeNull();
  });
});

describe("resolveDirections", () => {
  it("marks messages from the user's chat names as sent by the user, ignoring case", () => {
    const out = resolveDirections([msg(1, "Priya Shah"), msg(2, "ada example"), msg(3, null)], ["Ada Example"]);
    expect(out.map((m) => m.direction)).toEqual(["unknown", "outbound", "unknown"]);
  });

  it("never overrides messages that have an email or a known direction", () => {
    const out = resolveDirections([msg(1, "Ada", "someone@example.com"), msg(2, "Ada", null, "inbound")], ["Ada"]);
    expect(out.map((m) => m.direction)).toEqual(["unknown", "inbound"]);
  });

  it("changes nothing without chat names", () => {
    const input = [msg(1, "Ada")];
    expect(resolveDirections(input, [])).toBe(input);
  });
});

describe("describeOwner", () => {
  it("adds the chat names, quoted and on one line", () => {
    expect(describeOwner({ name: null, email: "ada@example.com", chatNames: ["Ada", "A\nB"] })).toBe(
      'The user is the account owner <ada@example.com>. In chat exports the user appears as "Ada", "A B".',
    );
    expect(describeOwner({ name: null, email: "ada@example.com" })).toBe("The user is the account owner <ada@example.com>.");
  });
});
