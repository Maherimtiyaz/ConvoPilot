import { describe, expect, it } from "vitest";

import { readFragmentToken } from "@/lib/auth/fragment";

// Synthetic, non-secret fixture shaped like a Supabase PKCE token hash.
const token = `pkce_${"0123456789abcdef".repeat(2)}`;

describe("readFragmentToken", () => {
  it("reads the requested key", () => {
    expect(readFragmentToken(`#th=${token}`, "th")).toBe(token);
    expect(readFragmentToken(`#t=${token}`, "t")).toBe(token);
  });

  it("ignores other keys and malformed tokens", () => {
    expect(readFragmentToken(`#t=${token}`, "th")).toBeNull();
    expect(readFragmentToken("#th=short", "th")).toBeNull();
    expect(readFragmentToken("#th=has spaces and <tags>abcdefghij", "th")).toBeNull();
    expect(readFragmentToken("", "th")).toBeNull();
    expect(readFragmentToken(`#th=${"a".repeat(2000)}`, "th")).toBeNull();
  });
});
