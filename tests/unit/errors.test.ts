import { describe, expect, it } from "vitest";
import { ZodError, z } from "zod";
import { AppError, toErrorEnvelope, unauthorized, withErrorHandling } from "@/lib/errors";

describe("toErrorEnvelope", () => {
  it("maps AppError to its status code and code", () => {
    const { status, body } = toErrorEnvelope(unauthorized("nope"));
    expect(status).toBe(401);
    expect(body.error.code).toBe("unauthorized");
    expect(body.error.message).toBe("nope");
  });

  it("maps ZodError to 422 with field details", () => {
    try {
      z.object({ email: z.string().email() }).parse({ email: "bad" });
      expect.unreachable();
    } catch (error) {
      const { status, body } = toErrorEnvelope(error as ZodError);
      expect(status).toBe(422);
      expect(body.error.code).toBe("validation_error");
      expect(body.error.details).toEqual([{ path: "email", message: expect.any(String) }]);
    }
  });

  it("hides internals for unknown errors", () => {
    const { status, body } = toErrorEnvelope(new Error("secret internal detail"));
    expect(status).toBe(500);
    expect(body.error.message).toBe("An unexpected error occurred");
    expect(JSON.stringify(body)).not.toContain("secret internal detail");
  });
});

describe("withErrorHandling", () => {
  it("converts a thrown AppError into a JSON error response", async () => {
    const handler = withErrorHandling(async () => {
      throw new AppError("not_found", "Contact not found");
    });
    const response = await handler();
    expect(response.status).toBe(404);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("not_found");
  });

  it("passes through successful responses", async () => {
    const handler = withErrorHandling(async () => new Response("ok"));
    const response = await handler();
    expect(response.status).toBe(200);
  });
});
