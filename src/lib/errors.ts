import { NextResponse } from "next/server";
import { ZodError } from "zod";

export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation_error"
  | "ai_provider_error"
  | "internal_error";

const statusByCode: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  validation_error: 422,
  ai_provider_error: 502,
  internal_error: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }
}

export function notFound(message = "Resource not found"): AppError {
  return new AppError("not_found", message);
}

export function unauthorized(message = "Authentication required"): AppError {
  return new AppError("unauthorized", message);
}

export type ErrorEnvelope = { error: { code: ErrorCode; message: string; details?: unknown } };

export function toErrorEnvelope(error: unknown): { status: number; body: ErrorEnvelope } {
  if (error instanceof AppError) {
    return {
      status: statusByCode[error.code],
      body: { error: { code: error.code, message: error.message, details: error.details } },
    };
  }

  if (error instanceof ZodError) {
    return {
      status: statusByCode.validation_error,
      body: {
        error: {
          code: "validation_error",
          message: "Request validation failed",
          details: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
      },
    };
  }

  // Never leak internals or message content to the client; log server-side.
  console.error("[unhandled_error]", error instanceof Error ? error.message : String(error));
  return {
    status: 500,
    body: { error: { code: "internal_error", message: "An unexpected error occurred" } },
  };
}

export function jsonError(error: unknown): NextResponse<ErrorEnvelope> {
  const { status, body } = toErrorEnvelope(error);
  return NextResponse.json(body, { status });
}

/** Wraps a route handler so every throw becomes a typed error envelope. */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      return jsonError(error);
    }
  };
}
