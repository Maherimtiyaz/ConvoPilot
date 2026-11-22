import { afterEach, describe, expect, it, vi } from "vitest";

import { EnvValidationError, parseEnv } from "@/lib/env/lazy-env";
import { appEnvSchema } from "@/lib/env/server";

describe("appEnvSchema", () => {
  it("accepts an empty environment using safe defaults", () => {
    expect(parseEnv("application", appEnvSchema, {})).toEqual({
      NODE_ENV: "development",
      NEXT_PUBLIC_APP_URL: "http://localhost:3000",
      LOG_LEVEL: "info",
    });
  });

  it("accepts the unfilled .env.example shape (empty strings)", () => {
    expect(() =>
      parseEnv("application", appEnvSchema, {
        NEXT_PUBLIC_APP_URL: "",
        LOG_LEVEL: "",
      }),
    ).not.toThrow();
  });

  it("accepts valid explicit values", () => {
    expect(
      parseEnv("application", appEnvSchema, {
        NODE_ENV: "production",
        NEXT_PUBLIC_APP_URL: "https://app.example.com",
        LOG_LEVEL: "warn",
      }),
    ).toEqual({
      NODE_ENV: "production",
      NEXT_PUBLIC_APP_URL: "https://app.example.com",
      LOG_LEVEL: "warn",
    });
  });

  it.each([
    ["LOG_LEVEL", { LOG_LEVEL: "verbose" }],
    ["NEXT_PUBLIC_APP_URL", { NEXT_PUBLIC_APP_URL: "not a url" }],
    ["NEXT_PUBLIC_APP_URL", { NEXT_PUBLIC_APP_URL: "javascript:alert(1)" }],
    ["NODE_ENV", { NODE_ENV: "staging" }],
  ])("rejects an invalid %s", (variable, source) => {
    try {
      parseEnv("application", appEnvSchema, source);
      expect.unreachable("expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect((error as EnvValidationError).issues.map((issue) => issue.variable)).toEqual([
        variable,
      ]);
    }
  });

  it("requires the public https address in production (no silent localhost invitation links)", () => {
    expect(() => parseEnv("application", appEnvSchema, { NODE_ENV: "production" })).toThrow(EnvValidationError);
    expect(() => parseEnv("application", appEnvSchema, { NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "http://app.example.com" })).toThrow(EnvValidationError);
    expect(() => parseEnv("application", appEnvSchema, { NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3000" })).not.toThrow();
    expect(() => parseEnv("application", appEnvSchema, { NODE_ENV: "development", NEXT_PUBLIC_APP_URL: "http://localhost:3000" })).not.toThrow();
  });

  it("exposes no secret-looking variable through NEXT_PUBLIC_", () => {
    const publicKeys = Object.keys(appEnvSchema.shape).filter((key) =>
      key.startsWith("NEXT_PUBLIC_"),
    );
    for (const key of publicKeys) {
      expect(key).not.toMatch(/SECRET|SERVICE_ROLE|PASSWORD|TOKEN|PRIVATE|API_KEY/);
    }
  });

  it("does not read the service-role key", () => {
    expect(Object.keys(appEnvSchema.shape)).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});

describe("getAppEnv", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("does not validate at import time, even with an invalid environment", async () => {
    vi.stubEnv("LOG_LEVEL", "verbose");
    vi.resetModules();
    // Import (not just get) must succeed with an invalid environment.
    const serverEnv = await import("@/lib/env/server");
    // resetModules() yields a fresh module graph, so compare against the
    // EnvValidationError class from that same graph.
    const { EnvValidationError: FreshEnvValidationError } = await import("@/lib/env/lazy-env");
    expect(() => serverEnv.getAppEnv()).toThrowError(FreshEnvValidationError);
    expect(() => serverEnv.getAppEnv()).toThrowError(/LOG_LEVEL \(invalid_value\)/);
  });

  it("reads process.env lazily on first call, not at import", async () => {
    vi.stubEnv("LOG_LEVEL", "error");
    vi.resetModules();
    const { getAppEnv } = await import("@/lib/env/server");
    // Change the environment after import: an eager implementation would
    // already have captured "error".
    vi.stubEnv("LOG_LEVEL", "debug");
    expect(getAppEnv().LOG_LEVEL).toBe("debug");
  });
});
