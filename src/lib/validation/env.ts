import { z } from "zod";

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is required"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  AI_PROVIDER: z.enum(["openai-compatible", "anthropic", "gemini", "ollama", "fake"]).default("fake"),
  AI_MODEL: z.string().min(1).default("fake-model"),
  AI_API_KEY: z.string().optional(),
  AI_BASE_URL: z.string().url().optional(),
  AI_EMBEDDING_MODEL: z.string().optional(),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export class EnvValidationError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`Invalid environment configuration:\n${issues.map((i) => `  - ${i}`).join("\n")}`);
    this.name = "EnvValidationError";
    this.issues = issues;
  }
}

/**
 * Parses and caches-free server environment variables.
 * Returns null when required vars are missing instead of crashing at import
 * time, so the app can render a setup notice before Supabase is configured.
 * Use requireServerEnv() where configuration is mandatory.
 */
export function getServerEnv(): ServerEnv | null {
  const parsed = serverEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    AI_PROVIDER: process.env.AI_PROVIDER,
    AI_MODEL: process.env.AI_MODEL,
    AI_API_KEY: process.env.AI_API_KEY,
    AI_BASE_URL: process.env.AI_BASE_URL,
    AI_EMBEDDING_MODEL: process.env.AI_EMBEDDING_MODEL,
    LOG_LEVEL: process.env.LOG_LEVEL,
  });

  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}

export function requireServerEnv(): ServerEnv {
  const env = getServerEnv();
  if (!env) {
    throw new EnvValidationError([
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required. Copy .env.example to .env.local and fill in your Supabase project values.",
    ]);
  }
  return env;
}
