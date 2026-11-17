import { describe, expect, it } from "vitest";

import { readWaitlistFormData, waitlistFormSchema } from "@/lib/validation/waitlist";

const valid = {
  fullName: "  Ada Example ",
  email: " Ada@Example.COM ",
  role: "founder",
  companySize: "2-10",
  biggestChallenge: "",
  consent: "yes",
  source: "LinkedIn",
};

describe("waitlistFormSchema", () => {
  it("normalises valid input", () => {
    expect(waitlistFormSchema.parse(valid)).toEqual({
      fullName: "Ada Example",
      email: "ada@example.com",
      role: "founder",
      companySize: "2-10",
      biggestChallenge: null,
      consent: "yes",
      source: "linkedin",
    });
  });

  it.each([
    ["fullName", ""],
    ["fullName", "x".repeat(121)],
    ["email", "not-an-email"],
    ["role", "ceo"],
    ["companySize", "1000"],
    ["biggestChallenge", "x".repeat(501)],
    ["consent", ""],
  ])("rejects %s=%j", (key, value) => {
    const result = waitlistFormSchema.safeParse({ ...valid, [key]: value });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path[0]).toBe(key);
  });

  it("drops an unusable source instead of failing", () => {
    expect(waitlistFormSchema.parse({ ...valid, source: "<script>" }).source).toBeNull();
  });
});

describe("readWaitlistFormData", () => {
  it("reads strings and treats missing fields as empty", () => {
    const form = new FormData();
    form.set("email", "a@example.com");
    form.set("website", "spam");
    const raw = readWaitlistFormData(form);
    expect(raw.email).toBe("a@example.com");
    expect(raw.fullName).toBe("");
    expect(raw.trap).toBe("spam");
  });
});
