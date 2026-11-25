import { afterEach, describe, expect, it, vi } from "vitest";

import { log, pathOnly, reportActionError } from "@/lib/observability/log";

describe("content-free logging", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const capture = () => {
    vi.stubEnv("NODE_ENV", "production");
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((l: string) => void lines.push(l));
    vi.spyOn(console, "error").mockImplementation((l: string) => void lines.push(l));
    return lines;
  };

  it("writes one JSON line with codes and numbers", () => {
    const lines = capture();
    log("info", { event: "ai.completed", workflow: "analyzeThread", durationMs: 1234, inputTokens: 10, outputTokens: 5 });
    expect(JSON.parse(lines[0])).toMatchObject({ level: "info", event: "ai.completed", workflow: "analyzeThread", durationMs: 1234 });
  });

  it("drops any field that could carry content", () => {
    const lines = capture();
    log("error", { event: "action.failed", code: "Could you send the revised deck by Friday?" });
    log("error", { event: "request.error", route: "/app/conversations?q=secret" });
    for (const line of lines) {
      expect(line).not.toContain("revised deck");
      expect(line).not.toContain("secret");
      expect(JSON.parse(line).code).toBe("log_field_rejected");
    }
  });

  it("logs only an error's code, never its message", () => {
    const lines = capture();
    reportActionError("studio", Object.assign(new Error("Priya's private message"), { code: "failed" }));
    reportActionError("studio", new Error("raw database error with data"));
    expect(lines.join("\n")).not.toMatch(/Priya|raw database/);
    expect(lines.map((l) => JSON.parse(l).code)).toEqual(["failed", "unexpected"]);
  });

  it("strips query strings and fragments from paths", () => {
    expect(pathOnly("/app/conversations?q=deck%20Friday")).toBe("/app/conversations");
    expect(pathOnly("/auth/confirm#th=token")).toBe("/auth/confirm");
    expect(pathOnly("not a path")).toBeUndefined();
  });

  it("is silent in tests and below the configured level", () => {
    const lines: string[] = [];
    vi.spyOn(console, "log").mockImplementation((l: string) => void lines.push(l));
    log("info", { event: "ai.completed" });
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LOG_LEVEL", "warn");
    log("info", { event: "ai.completed" });
    expect(lines).toHaveLength(0);
  });
});
