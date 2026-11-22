import { describe, expect, it } from "vitest";

import { aiEnvSchema } from "@/lib/env/ai";
import { EnvValidationError, parseEnv } from "@/lib/env/lazy-env";

describe("aiEnvSchema", () => {
  it("uses safe defaults without a key", () => {
    expect(parseEnv("AI", aiEnvSchema, {})).toMatchObject({ AI_MODEL: "claude-opus-5-5", AI_DAILY_COST_CAP_USD: 1 });
  });

  it("refuses to send conversations to another host in production", () => {
    expect(() => parseEnv("AI", aiEnvSchema, { NODE_ENV: "production", ANTHROPIC_BASE_URL: "http://evil.example.com" })).toThrow(EnvValidationError);
    expect(() => parseEnv("AI", aiEnvSchema, { NODE_ENV: "production", ANTHROPIC_BASE_URL: "https://proxy.example.com" })).toThrow(EnvValidationError);
    expect(() => parseEnv("AI", aiEnvSchema, { NODE_ENV: "production", ANTHROPIC_BASE_URL: "https://api.anthropic.com" })).not.toThrow();
    expect(() => parseEnv("AI", aiEnvSchema, { NODE_ENV: "production", ANTHROPIC_BASE_URL: "http://127.0.0.1:4010" })).not.toThrow();
    expect(() => parseEnv("AI", aiEnvSchema, { NODE_ENV: "production" })).not.toThrow();
  });

  it("allows a local mock outside production", () => {
    expect(() => parseEnv("AI", aiEnvSchema, { ANTHROPIC_BASE_URL: "http://localhost:4010" })).not.toThrow();
  });
});
