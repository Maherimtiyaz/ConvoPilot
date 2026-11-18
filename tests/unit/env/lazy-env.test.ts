import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  createLazyEnv,
  EnvValidationError,
  optionalEnvString,
  parseEnv,
} from "@/lib/env/lazy-env";

const schema = z.object({
  REQUIRED_URL: optionalEnvString(z.url()),
  OPTIONAL_LEVEL: optionalEnvString(z.enum(["a", "b"]).default("a")),
});

const SECRET_LOOKING_VALUE = "not-a-url-but-sensitive-value-123";

describe("parseEnv", () => {
  it("returns typed values for a valid source", () => {
    const env = parseEnv("test", schema, {
      REQUIRED_URL: "https://example.com",
      OPTIONAL_LEVEL: "b",
    });
    expect(env).toEqual({ REQUIRED_URL: "https://example.com", OPTIONAL_LEVEL: "b" });
  });

  it("applies defaults for missing optional variables", () => {
    const env = parseEnv("test", schema, { REQUIRED_URL: "https://example.com" });
    expect(env.OPTIONAL_LEVEL).toBe("a");
  });

  it("reports a missing required variable by name", () => {
    expect(() => parseEnv("test", schema, {})).toThrowError(EnvValidationError);
    try {
      parseEnv("test", schema, {});
    } catch (error) {
      expect(error).toBeInstanceOf(EnvValidationError);
      expect((error as EnvValidationError).issues).toEqual([
        { variable: "REQUIRED_URL", code: "invalid_type" },
      ]);
    }
  });

  it("treats empty and whitespace-only strings as missing", () => {
    for (const value of ["", "   "]) {
      expect(() => parseEnv("test", schema, { REQUIRED_URL: value })).toThrowError(
        /REQUIRED_URL \(invalid_type\)/,
      );
    }
  });

  it("reports invalid values without including the value", () => {
    let caught: unknown;
    try {
      parseEnv("test", schema, {
        REQUIRED_URL: SECRET_LOOKING_VALUE,
        OPTIONAL_LEVEL: "z",
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(EnvValidationError);
    const envError = caught as EnvValidationError;
    expect(envError.issues.map((issue) => issue.variable).sort()).toEqual([
      "OPTIONAL_LEVEL",
      "REQUIRED_URL",
    ]);
    expect(envError.message).not.toContain(SECRET_LOOKING_VALUE);
    expect(JSON.stringify(envError.issues)).not.toContain(SECRET_LOOKING_VALUE);
  });
});

describe("createLazyEnv", () => {
  it("does not read the source until get() is called", () => {
    const readSource = vi.fn(() => ({ REQUIRED_URL: "https://example.com" }));
    const env = createLazyEnv("test", schema, readSource);
    expect(readSource).not.toHaveBeenCalled();
    expect(env.get().REQUIRED_URL).toBe("https://example.com");
    expect(readSource).toHaveBeenCalledTimes(1);
  });

  it("can be created with an invalid source without throwing", () => {
    expect(() => createLazyEnv("test", schema, () => ({}))).not.toThrow();
  });

  it("caches a successful result", () => {
    const readSource = vi.fn(() => ({ REQUIRED_URL: "https://example.com" }));
    const env = createLazyEnv("test", schema, readSource);
    env.get();
    env.get();
    expect(readSource).toHaveBeenCalledTimes(1);
  });

  it("does not cache failures, so a corrected environment is picked up", () => {
    let source: Record<string, string | undefined> = {};
    const env = createLazyEnv("test", schema, () => source);
    expect(() => env.get()).toThrowError(EnvValidationError);
    source = { REQUIRED_URL: "https://example.com" };
    expect(env.get().REQUIRED_URL).toBe("https://example.com");
  });

  it("re-reads after reset()", () => {
    const readSource = vi.fn(() => ({ REQUIRED_URL: "https://example.com" }));
    const env = createLazyEnv("test", schema, readSource);
    env.get();
    env.reset();
    env.get();
    expect(readSource).toHaveBeenCalledTimes(2);
  });

  it("refuses to run in a browser context", () => {
    vi.stubGlobal("window", {});
    try {
      const env = createLazyEnv("test", schema, () => ({ REQUIRED_URL: "https://example.com" }));
      expect(() => env.get()).toThrowError(/must not be read in the browser/);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
