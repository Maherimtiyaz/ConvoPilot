import { z } from "zod";

import type { TokenBudget } from "../budget";
import { validateCitations, type Citation } from "../citations";
import { definePrompt } from "../prompts";
import type { AiProvider } from "../provider";
import { generateStructured } from "../structured";
import type { ModelMetadata } from "../types";

import { describeOwner, renderThread, type ThreadMessage, type ThreadOwner } from "./thread-input";

const cite = z.object({
  message: z.number().int().min(1).max(50).describe("The [n] number of the cited message"),
  quote: z.string().min(1).max(300).describe("Short text copied exactly from that message"),
});
const point = z.object({ text: z.string().min(1).max(400), citations: z.array(cite).min(1).max(4) });

export const analysisOutput = z.object({
  intent: point.describe("What the other person wants from the user, in one sentence"),
  main_points: z.array(point).min(1).max(8),
  expected_response: point.describe("What reply or action they expect from the user, and by when if stated"),
  urgency: z.enum(["low", "medium", "high"]),
  urgency_reason: z.string().max(300),
  risks: z.array(point).max(5).describe("Things that could go wrong or be missed; empty if none"),
  confidence: z.enum(["low", "medium", "high"]),
});
type AnalysisOutput = z.infer<typeof analysisOutput>;

interface AnalyzeInput {
  subject: string;
  messages: ThreadMessage[];
  owner: ThreadOwner;
}

export const analyzeEmailPrompt = definePrompt<AnalyzeInput, AnalysisOutput>({
  id: "analyze-email",
  version: 1,
  maxOutputTokens: 8_000,
  output: analysisOutput,
  system: () =>
    [
      "You are ConvoPilot, a careful chief of staff for a busy founder. You read an email thread and explain, plainly and briefly, what the other person wants and what the user needs to do.",
      "Rules:",
      "- Every statement must be backed by citations to the numbered messages ([n]) with a short quote copied exactly from that message. Never cite a message that does not support the statement.",
      "- Never invent facts, names, dates, amounts or commitments. If something is unclear, say so and lower your confidence.",
      "- Write in plain, specific language. No filler, no hype.",
    ].join("\n"),
  user: (input, nonce) => `${describeOwner(input.owner)}\n\nAnalyse this thread:\n\n${renderThread(input.subject, input.messages, nonce)}`,
});

export interface StoredCitation {
  messageId: string;
  position: number;
  quote: string | null;
}
export interface StoredPoint {
  text: string;
  citations: StoredCitation[];
}
export interface StoredAnalysis {
  version: 1;
  intent: StoredPoint | null;
  mainPoints: StoredPoint[];
  expectedResponse: StoredPoint | null;
  urgency: "low" | "medium" | "high";
  urgencyReason: string;
  risks: StoredPoint[];
  confidence: "low" | "medium" | "high";
  /** Statements removed because none of their citations held up. */
  droppedUnsupported: number;
}

export interface AnalysisResult {
  analysis: StoredAnalysis;
  metadata: ModelMetadata;
}

/**
 * analyzeThread workflow (docs/AGENT_DESIGN.md §3): stored messages → model call with a
 * Zod-validated schema → citation validation (unsupported statements dropped) → result to store.
 */
export async function analyzeThread(provider: AiProvider, input: AnalyzeInput, budget: TokenBudget): Promise<AnalysisResult> {
  const { data, metadata } = await generateStructured(provider, analyzeEmailPrompt, input, budget);
  const byPosition = new Map(input.messages.map((m) => [m.position, m]));
  const workspaceId = input.messages[0]?.workspaceId ?? "";
  const supplied = input.messages.map((m) => ({ id: m.id, workspaceId: m.workspaceId, deleted: false, text: m.body }));
  let dropped = 0;

  const check = (p: z.infer<typeof point>): StoredPoint | null => {
    const raw: Citation[] = p.citations.flatMap((c) => {
      const msg = byPosition.get(c.message);
      return msg ? [{ sourceId: msg.id, quote: c.quote }] : [{ sourceId: `missing-${c.message}`, quote: c.quote }];
    });
    const { valid } = validateCitations(raw, workspaceId, supplied);
    if (valid.length === 0) {
      dropped += 1;
      return null;
    }
    return {
      text: p.text,
      citations: valid.map((c) => ({ messageId: c.sourceId, position: input.messages.find((m) => m.id === c.sourceId)!.position, quote: c.quote ?? null })),
    };
  };

  const analysis: StoredAnalysis = {
    version: 1,
    intent: check(data.intent),
    mainPoints: data.main_points.map(check).filter((p): p is StoredPoint => p !== null),
    expectedResponse: check(data.expected_response),
    urgency: data.urgency,
    urgencyReason: data.urgency_reason,
    risks: data.risks.map(check).filter((p): p is StoredPoint => p !== null),
    confidence: data.confidence,
    droppedUnsupported: 0,
  };
  analysis.droppedUnsupported = dropped;
  return { analysis, metadata };
}
