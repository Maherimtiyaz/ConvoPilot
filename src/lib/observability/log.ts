import "server-only";

import { z } from "zod";

/**
 * The only place in src/ allowed to write logs (scripts/ci/app-guards.mjs). Production-readiness
 * review 2026-11-25: failures must be visible to the operator, without ever logging private data.
 *
 * Every field is a short code, a path without its query string, a number or a fixed enum. Free
 * text (error messages, message bodies, drafts, prompts, model output, emails, tokens) cannot pass
 * the schema, so a log line can never carry content. One JSON object per line (Vercel log search).
 */
const code = z.string().regex(/^[A-Za-z0-9_.:-]{1,60}$/); // identifiers only: no spaces, so no sentences
const logEvent = z
  .object({
    event: z.enum(["request.error", "ai.completed", "ai.failed", "action.failed"]),
    code: code.optional(),
    workflow: code.optional(),
    route: z.string().regex(/^\/[A-Za-z0-9_./[\]-]{0,200}$/).optional(),
    method: z.enum(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]).optional(),
    kind: code.optional(),
    digest: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
    durationMs: z.number().int().min(0).max(3_600_000).optional(),
    inputTokens: z.number().int().min(0).optional(),
    outputTokens: z.number().int().min(0).optional(),
  })
  .strict();

export type LogEvent = z.input<typeof logEvent>;

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;

function threshold(): number {
  const configured = process.env.LOG_LEVEL;
  return configured && configured in LEVELS ? LEVELS[configured as Level] : LEVELS.info;
}

/** Writes one structured line. Anything not matching the schema is dropped to its event name. */
export function log(level: Level, event: LogEvent): void {
  if (process.env.NODE_ENV === "test" || LEVELS[level] < threshold()) return;
  const parsed = logEvent.safeParse(event);
  const line = JSON.stringify({ level, at: new Date().toISOString(), ...(parsed.success ? parsed.data : { event: event.event, code: "log_field_rejected" }) });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

/** A path without its query string or fragment (search words must never reach the logs). */
export function pathOnly(path: string): string | undefined {
  const bare = path.split(/[?#]/)[0];
  return /^\/[A-Za-z0-9_./[\]-]{0,200}$/.test(bare) ? bare : undefined;
}

/**
 * Logs a Server Action failure that the user sees as a generic message: only the area and the
 * error's code (never its message). Known error classes carry a `code`; anything else is
 * "unexpected".
 */
export function reportActionError(area: string, error: unknown): void {
  const raw = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : "unexpected";
  log("error", { event: "action.failed", kind: area, code: /^[A-Za-z0-9_.:-]{1,60}$/.test(raw) ? raw : "unexpected" });
}
