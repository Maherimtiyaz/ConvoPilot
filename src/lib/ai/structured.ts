import { z } from "zod";

import type { TokenBudget } from "./budget";
import { callModel } from "./call";
import { AiError } from "./errors";
import type { PromptDefinition } from "./prompts";
import type { AiProvider, ChatMessage } from "./provider";
import type { ModelMetadata, TokenUsage } from "./types";
import { createNonce, untrustedPreamble } from "./untrusted";

export interface StructuredResult<T> {
  data: T;
  metadata: ModelMetadata;
}

/**
 * Runs a versioned prompt and returns Zod-validated output (§9): invalid output gets exactly one
 * repair retry, then a typed `invalid_output` failure. Unvalidated output is never returned.
 */
export async function generateStructured<TInput, TOutput>(
  provider: AiProvider,
  prompt: PromptDefinition<TInput, TOutput>,
  input: TInput,
  budget: TokenBudget,
): Promise<StructuredResult<TOutput>> {
  const nonce = createNonce();
  const schema = JSON.stringify(z.toJSONSchema(prompt.output));
  const messages: ChatMessage[] = [
    {
      role: "system",
      content: [
        prompt.system(nonce),
        untrustedPreamble(nonce),
        `Answer with exactly one JSON object and nothing else. It must match this JSON Schema: ${schema}`,
      ].join("\n\n"),
    },
    { role: "user", content: prompt.user(input, nonce) },
  ];

  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };
  let model = "unknown";

  for (let attempt = 1; attempt <= 2; attempt++) {
    const result = await callModel(provider, { messages, json: true, maxOutputTokens: prompt.maxOutputTokens }, budget);
    usage.inputTokens += result.usage.inputTokens;
    usage.outputTokens += result.usage.outputTokens;
    model = result.model;

    const parsed = parseJsonObject(result.text);
    const checked = parsed.ok ? prompt.output.safeParse(parsed.value) : null;
    if (checked?.success) {
      return {
        data: checked.data,
        metadata: { provider: provider.id, model, promptId: prompt.id, promptVersion: prompt.version, usage },
      };
    }
    if (attempt === 2) break;
    // Repair: describe only the shape problems (paths and codes), never echo content.
    const problems = checked ? describeIssues(checked.error) : "the answer was not a single JSON object";
    messages.push(
      { role: "assistant", content: result.text },
      { role: "user", content: `That answer was not valid (${problems}). Reply again with only the corrected JSON object.` },
    );
  }
  throw new AiError("invalid_output");
}

/** Accepts a bare JSON object or one wrapped in a ```json fence. */
export function parseJsonObject(text: string): { ok: true; value: unknown } | { ok: false } {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  if (!trimmed.startsWith("{")) return { ok: false };
  try {
    const value: unknown = JSON.parse(trimmed);
    return value !== null && typeof value === "object" && !Array.isArray(value) ? { ok: true, value } : { ok: false };
  } catch {
    return { ok: false };
  }
}

function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 8)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.code}`)
    .join("; ");
}
