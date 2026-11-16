import { afterEach, describe, expect, it, vi } from "vitest";

import { EnvValidationError, parseEnv } from "@/lib/env/lazy-env";
import { supabaseEnvSchema } from "@/lib/env/supabase";

const VALID = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "publishable-key-placeholder-value",
};

describe("supabaseEnvSchema", () => {
  it("accepts a valid URL and key", () => {
    expect(parseEnv("Supabase", supabaseEnvSchema, VALID)).toEqual(VALID);
  });

  it("reports missing variables by name only", () => {
    try {
      parseEnv("Supabase", supabaseEnvSchema, { NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_ANON_KEY: " " });
      expect.unreachable("expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect((error as EnvValidationError).issues.map((issue) => issue.variable).sort()).toEqual([
        "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        "NEXT_PUBLIC_SUPABASE_URL",
      ]);
    }
  });

  it("rejects non-http(s) URLs without echoing the value", () => {
    const value = "javascript:alert(document.cookie)";
    try {
      parseEnv("Supabase", supabaseEnvSchema, { ...VALID, NEXT_PUBLIC_SUPABASE_URL: value });
      expect.unreachable("expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect((error as Error).message).not.toContain(value);
    }
  });

  it("never reads the service-role key", () => {
    expect(Object.keys(supabaseEnvSchema.shape)).toEqual([
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    ]);
  });
});

describe("getSupabaseEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("does not validate at import time and reads the environment on first call", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.resetModules();
    const { getSupabaseEnv } = await import("@/lib/env/supabase");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", VALID.NEXT_PUBLIC_SUPABASE_URL);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", VALID.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    expect(getSupabaseEnv()).toEqual(VALID);
  });
});
