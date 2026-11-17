import type { RequestContext } from "@/lib/auth/context";

/** Workflows the orchestrator may run (docs/AGENT_DESIGN.md §3). */
export const WORKFLOWS = ["analyzeThread", "draftReply", "extractCommitments", "proposeMemories", "askHistory"] as const;
export type WorkflowName = (typeof WORKFLOWS)[number];

/** Tool permission levels (§5). Execute tools are not allowed in v0.1. */
export type Permission = "read" | "propose" | "execute";

/** The verified context every AI call runs in. Built only from getRequestContext(). */
export interface AiContext extends RequestContext {
  workflow: WorkflowName;
}

/** Token usage reported by a provider for one call. */
export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/** Metadata stored on every derived record (§9). */
export interface ModelMetadata {
  provider: string;
  model: string;
  promptId: string;
  promptVersion: number;
  usage: TokenUsage;
}
