import { afterEach, describe, expect, it } from "vitest";
import { EnvValidationError, getServerEnv, requireServerEnv } from "@/lib/validation/env";

function setEnv(values: Record<string, string | undefined>) {
  const keys = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "AI_PROVIDER",
    "AI_MODEL",
    "AI_API_KEY",
    "AI_BASE_URL",
    "AI_EMBEDDING_MODEL",
    "LOG_LEVEL",
  ];
  for (const key of keys) {
    if (values[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = values[key];
    }
  }
}

const validEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
};

describe("getServerEnv", () => {
  afterEach(() => {
    setEnv(validEnv);
  });

  it("parses a valid environment with defaults", () => {
    setEnv(validEnv);
    const env = getServerEnv();
    expect(env).not.toBeNull();
    expect(env?.AI_PROVIDER).toBe("fake");
    expect(env?.AI_MODEL).toBe("fake-model");
    expect(env?.LOG_LEVEL).toBe("info");
  });

  it("returns null instead of throwing when Supabase is unconfigured", () => {
    setEnv({ NEXT_PUBLIC_SUPABASE_URL: undefined, NEXT_PUBLIC_SUPABASE_ANON_KEY: undefined });
    expect(getServerEnv()).toBeNull();
  });

  it("rejects an invalid Supabase URL", () => {
    setEnv({ ...validEnv, NEXT_PUBLIC_SUPABASE_URL: "not-a-url" });
    expect(() => requireServerEnv()).toThrow(EnvValidationError);
  });
});
