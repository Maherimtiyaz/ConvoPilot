import { z } from "zod";

import type { TokenBudget } from "../budget";
import { validateCitations } from "../citations";
import { definePrompt } from "../prompts";
import type { AiProvider } from "../provider";
import { generateStructured } from "../structured";
import type { ModelMetadata } from "../types";

import { describeOwner, renderThread, type ThreadMessage, type ThreadOwner } from "./thread-input";

const cite = z.object({
  message: z.number().int().min(1).max(50).describe("The [n] number of the cited message"),
  quote: z.string().min(1).max(300).describe("Short text copied exactly from that message, where the promise or request is stated"),
});

const item = z.object({
  description: z.string().min(1).max(300).describe("The commitment as one plain sentence, e.g. 'Send Priya the revised deck'"),
  owner: z.enum(["me", "them"]).describe("'me' if the user promised or agreed to do it; 'them' if the other person promised it"),
  origin: z.enum(["extracted", "inferred"]).describe("'extracted' if a message states it explicitly; 'inferred' if it is only implied"),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().describe("Only when a message states an exact calendar date; otherwise null"),
  due_text: z.string().max(100).nullable().describe("The deadline as written, e.g. 'by Friday'; null if none"),
  confidence: z.enum(["low", "medium", "high"]),
  citations: z.array(cite).min(1).max(3),
  task: z.object({ title: z.string().min(1).max(120) }).nullable().describe("A follow-up task for the user, only when owner is 'me'; otherwise null"),
});

export const commitmentsOutput = z.object({
  commitments: z.array(item).max(10).describe("Empty if nobody promised or was asked to do anything"),
});
type CommitmentsOutput = z.infer<typeof commitmentsOutput>;

interface ExtractInput {
  subject: string;
  messages: ThreadMessage[];
  owner: ThreadOwner;
}

export const extractCommitmentsPrompt = definePrompt<ExtractInput, CommitmentsOutput>({
  id: "extract-commitments",
  version: 2,
  maxOutputTokens: 6_000,
  output: commitmentsOutput,
  system: () =>
    [
      "You are ConvoPilot, a careful chief of staff. You find commitments in an email thread: things the user promised or agreed to do, and things the other person promised the user.",
      "Rules:",
      "- Only list a commitment if a message states or clearly implies it. Never invent commitments, people, deadlines or amounts. An empty list is a good answer.",
      "- A request the user has not agreed to is not the user's commitment; if the user is clearly expected to act on it, list it as 'inferred' with lower confidence.",
      "- Cite the message(s) with a short quote copied exactly from that message.",
      "- Put an exact date in due_date only if a message states the calendar date. Relative deadlines like 'Friday' or 'next week' go in due_text, with due_date null.",
      "- Suggest a task only for the user's own commitments, as a short imperative title.",
    ].join("\n"),
  user: (input, nonce) => `${describeOwner(input.owner)}\n\nFind the commitments in this thread:\n\n${renderThread(input.subject, input.messages, nonce)}`,
});

/** One proposal ready to store with public.store_commitment_proposals (snake_case on purpose). */
export interface CommitmentProposal {
  description: string;
  owner: "me" | "them";
  origin: "extracted" | "inferred";
  confidence: "low" | "medium" | "high";
  due_date: string | null;
  due_text: string | null;
  citations: { message_id: string; quote: string }[];
  task: { title: string } | null;
}

export interface ExtractResult {
  proposals: CommitmentProposal[];
  /** Proposals dropped because none of their citations held up. */
  droppedUnsupported: number;
  metadata: ModelMetadata;
}

const realDate = (s: string | null) => (s && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s) ? s : null);

/**
 * extractCommitments workflow (docs/AGENT_DESIGN.md §3): stored messages → one model call with a
 * Zod-validated schema → citation validation (uncited proposals dropped). The result is only ever
 * stored as `proposed`; the user decides.
 */
export async function extractCommitments(provider: AiProvider, input: ExtractInput, budget: TokenBudget): Promise<ExtractResult> {
  const { data, metadata } = await generateStructured(provider, extractCommitmentsPrompt, input, budget);
  const byPosition = new Map(input.messages.map((m) => [m.position, m]));
  const workspaceId = input.messages[0]?.workspaceId ?? "";
  const supplied = input.messages.map((m) => ({ id: m.id, workspaceId: m.workspaceId, deleted: false, text: m.body }));
  let dropped = 0;
  const proposals: CommitmentProposal[] = [];

  for (const c of data.commitments) {
    const { valid } = validateCitations(
      c.citations.map((x) => ({ sourceId: byPosition.get(x.message)?.id ?? `missing-${x.message}`, quote: x.quote })),
      workspaceId,
      supplied,
    );
    if (valid.length === 0) {
      dropped += 1;
      continue;
    }
    proposals.push({
      description: c.description.trim(),
      owner: c.owner,
      origin: c.origin,
      confidence: c.confidence,
      due_date: realDate(c.due_date),
      due_text: c.due_text?.trim() || null,
      citations: valid.map((v) => ({ message_id: v.sourceId, quote: v.quote ?? "" })),
      task: c.owner === "me" && c.task ? { title: c.task.title.trim() } : null,
    });
  }
  return { proposals, droppedUnsupported: dropped, metadata };
}
