import { z } from "zod";
import type { ChatProvider } from "@/lib/ai/providers/types";
import {
  EXTRACT_COMMITMENTS_PROMPT_VERSION,
  buildExtractCommitmentsMessages,
} from "@/lib/ai/prompts/extract-commitments";
import { extractedCommitmentsSchema, type CommitmentProposal } from "@/lib/schemas/productivity";
import { AppError } from "@/lib/errors";

const rawSchema = z.object({ commitments: z.array(z.unknown()) });

export interface ExtractCommitmentsResult {
  proposals: CommitmentProposal[];
  promptVersion: string;
  model: string;
  providerId: string;
}

/**
 * Extracts proposed commitments from a stored conversation. Output is
 * validated against the schema; ambiguous due dates are forced to null so
 * nothing unconfirmed ever becomes a hard deadline. Proposals always start
 * in the approval queue — never automatically confirmed.
 */
export async function extractCommitments(
  provider: ChatProvider,
  threadText: string,
  context?: { conversationDate?: string | null },
): Promise<ExtractCommitmentsResult> {
  const messages = buildExtractCommitmentsMessages(threadText, context);

  let lastIssue = "unknown error";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await provider.complete({
      messages,
      temperature: 0.1,
      responseFormat: { type: "json_object" },
    });

    let raw: unknown;
    try {
      raw = JSON.parse(response.content);
    } catch {
      lastIssue = "model returned non-JSON output";
      continue;
    }

    const shape = rawSchema.safeParse(raw);
    if (!shape.success) {
      lastIssue = shape.error.issues.map((i) => i.message).join("; ");
      continue;
    }

    const validated = extractedCommitmentsSchema.safeParse(raw);
    if (!validated.success) {
      lastIssue = validated.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      continue;
    }

    return {
      proposals: validated.data.commitments,
      promptVersion: EXTRACT_COMMITMENTS_PROMPT_VERSION,
      model: response.model,
      providerId: response.providerId,
    };
  }

  throw new AppError(
    "ai_provider_error",
    "Commitment extraction could not be validated. Please try again.",
    { detail: lastIssue },
  );
}
