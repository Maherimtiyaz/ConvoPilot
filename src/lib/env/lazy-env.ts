import { z } from "zod";

/**
 * One problem with one environment variable. Deliberately carries the
 * variable name and a Zod issue code only — never the value — so it is safe
 * to log and to show in error output.
 */
export interface EnvIssue {
  variable: string;
  code: string;
}

export class EnvValidationError extends Error {
  readonly issues: readonly EnvIssue[];

  constructor(scope: string, issues: readonly EnvIssue[]) {
    const summary = issues
      .map((issue) => `${issue.variable} (${issue.code})`)
      .join(", ");
    super(`Invalid ${scope} environment configuration: ${summary}`);
    this.name = "EnvValidationError";
    this.issues = issues;
  }
}

export type EnvSource = Readonly<Record<string, string | undefined>>;

/**
 * Treats empty strings as "not set". `.env.example` ships keys with empty
 * values, so a copied-but-unfilled file must behave like a missing variable.
 */
export function optionalEnvString<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    schema,
  );
}

/**
 * Validates `source` against `schema` and returns the typed result.
 * Throws EnvValidationError listing variable names and issue codes only.
 */
export function parseEnv<T extends z.ZodObject>(
  scope: string,
  schema: T,
  source: EnvSource,
): z.output<T> {
  const result = schema.safeParse(source);
  if (result.success) {
    return result.data;
  }
  const issues: EnvIssue[] = result.error.issues.map((issue) => ({
    variable: issue.path.map(String).join(".") || "(root)",
    code: issue.code,
  }));
  throw new EnvValidationError(scope, issues);
}

export interface LazyEnv<T> {
  /** Validates on first call, then returns the cached result. */
  get(): T;
  /** Clears the cache. Intended for tests. */
  reset(): void;
}

/**
 * Creates a lazily validated environment section.
 *
 * Nothing is read or validated at import time, so `next build` and CI can
 * import modules that depend on configuration without any secrets present.
 * Validation happens on the first `get()` call, wherever that call runs.
 * If `get()` is called from a statically prerendered Server Component, it runs
 * during `next build`: validation then happens at build time and the values
 * read are frozen into the static output. Call env getters only from
 * request-time code (Server Actions, Route Handlers, or after a dynamic API
 * such as `connection()` or `cookies()`).
 *
 * Successful results are cached; failures are not, so a corrected environment
 * is picked up on the next call.
 */
export function createLazyEnv<T extends z.ZodObject>(
  scope: string,
  schema: T,
  readSource: () => EnvSource = () => process.env,
): LazyEnv<z.output<T>> {
  let cached: z.output<T> | undefined;
  return {
    get() {
      if (typeof window !== "undefined") {
        throw new Error(`The ${scope} environment must not be read in the browser`);
      }
      if (cached === undefined) {
        cached = parseEnv(scope, schema, readSource());
      }
      return cached;
    },
    reset() {
      cached = undefined;
    },
  };
}
