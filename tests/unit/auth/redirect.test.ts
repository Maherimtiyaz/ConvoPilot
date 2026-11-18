import { describe, expect, it } from "vitest";

import { safeNextPath } from "@/lib/auth/redirect";

describe("safeNextPath", () => {
  it.each(["/app", "/app/contacts", "/app/settings"])("accepts in-app path %s", (path) => {
    expect(safeNextPath(path)).toBe(path);
  });

  it.each([
    undefined,
    "",
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "/app/../login",
    "/app?x=1",
    "/app#x",
    "/app%2F..",
    "/login",
    "/application",
    "/app/" + "a".repeat(300),
  ])("rejects %s", (path) => {
    expect(safeNextPath(path)).toBe("/app");
  });
});
