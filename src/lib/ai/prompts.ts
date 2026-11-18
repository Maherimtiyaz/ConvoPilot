import type { z } from "zod";

/**
 * A versioned prompt paired with its output schema (§9). The id + version are stored on every
 * derived record, so a changed prompt must get a new version number.
 */
export interface PromptDefinition<TInput, TOutput> {
  id: string;
  version: number;
  /** Builds the system instructions. Must not contain user content. */
  system: (nonce: string) => string;
  /** Builds the user message; untrusted content must go through wrapUntrusted(). */
  user: (input: TInput, nonce: string) => string;
  output: z.ZodType<TOutput>;
  /** Upper bound for the model's answer. */
  maxOutputTokens: number;
}

const PROMPT_ID = /^[a-z][a-z0-9-]{1,40}$/;

export function definePrompt<TInput, TOutput>(def: PromptDefinition<TInput, TOutput>): PromptDefinition<TInput, TOutput> {
  if (!PROMPT_ID.test(def.id) || !Number.isInteger(def.version) || def.version < 1) {
    throw new Error("Invalid prompt id or version");
  }
  return def;
}

export const promptKey = (p: { id: string; version: number }) => `${p.id}@${p.version}`;
