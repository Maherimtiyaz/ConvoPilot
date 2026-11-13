import { z } from "zod";
import type { ChatProvider } from "@/lib/ai/providers/types";
import { ANALYZE_EMAIL_PROMPT_VERSION, buildAnalyzeEmailMessages } from "@/lib/ai/prompts/analyze-email";
import { DRAFT_REPLY_PROMPT_VERSION, buildDraftReplyMessages, type DraftReplyInput } from "@/lib/ai/prompts/draft-reply";
import { emailAnalysisSchema, type EmailAnalysis } from "@/lib/schemas/communication";
import { AppError } from "@/lib/errors";

const rawJsonSchema = z.object({
  intent: z.string(),
  urgency: z.string(),
  summary: z.string(),
  mainPoints: z.array(z.string()),
  expectedResponse: z.string(),
  senderAsk: z.string(),
  confidence: z.number(),
});

export interface AnalyzeResult {
  analysis: EmailAnalysis;
  promptVersion: string;
  model: string;
  providerId: string;
}

/**
 * Analyzes a pasted thread. The thread text is treated as untrusted data:
 * it is passed inside delimiters and validated output is required before
 * anything is persisted. Invalid model output is retried once, then fails.
 */
export async function analyzeEmail(provider: ChatProvider, threadText: string): Promise<AnalyzeResult> {
  const messages = buildAnalyzeEmailMessages(threadText);

  let lastIssue = "unknown error";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await provider.complete({
      messages,
      temperature: 0.2,
      responseFormat: { type: "json_object" },
    });

    let raw: unknown;
    try {
      raw = JSON.parse(response.content);
    } catch {
      lastIssue = "model returned non-JSON output";
      continue;
    }

    const parsed = rawJsonSchema.safeParse(raw);
    if (!parsed.success) {
      lastIssue = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      continue;
    }

    const validated = emailAnalysisSchema.safeParse(parsed.data);
    if (!validated.success) {
      lastIssue = validated.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      continue;
    }

    return {
      analysis: validated.data,
      promptVersion: ANALYZE_EMAIL_PROMPT_VERSION,
      model: response.model,
      providerId: response.providerId,
    };
  }

  throw new AppError(
    "ai_provider_error",
    "The analysis could not be validated. Please try again.",
    { detail: lastIssue },
  );
}

export interface ReplyResult {
  content: string;
  promptVersion: string;
  model: string;
  providerId: string;
}

export async function generateReply(provider: ChatProvider, input: DraftReplyInput): Promise<ReplyResult> {
  const response = await provider.complete({
    messages: buildDraftReplyMessages(input),
    temperature: 0.6,
  });

  const content = response.content.trim();
  if (!content) {
    throw new AppError("ai_provider_error", "The model returned an empty draft. Please try again.");
  }

  return {
    content,
    promptVersion: DRAFT_REPLY_PROMPT_VERSION,
    model: response.model,
    providerId: response.providerId,
  };
}
