import { z } from "zod";

import type { ToolSpec } from "../provider";
import type { AiContext, Permission, WorkflowName } from "../types";

/** A tool the model may request. Handlers call application services, never repositories. */
export interface ToolDefinition<TArgs = unknown> {
  name: string;
  description: string;
  permission: Permission;
  args: z.ZodType<TArgs>;
  run: (ctx: AiContext, args: TArgs) => Promise<unknown>;
}

/**
 * Per-workflow tool allow-list (docs/AGENT_DESIGN.md §4; ARCHITECTURE.md §5.4 governs).
 * Enforced by the policy layer, never by the prompt.
 */
export const WORKFLOW_TOOLS: Record<WorkflowName, readonly string[]> = {
  analyzeThread: ["search_contacts", "get_contact_history", "analyze_email"],
  draftReply: ["get_contact_history", "summarize_thread", "draft_reply"],
  extractCommitments: ["extract_commitments", "create_task"],
  proposeMemories: ["save_memory"],
  askHistory: ["search_contacts", "get_contact_history", "search_messages", "summarize_thread"],
};

const TOOL_NAME = /^[a-z][a-z0-9_]{1,48}$/;

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register<TArgs>(tool: ToolDefinition<TArgs>): this {
    if (!TOOL_NAME.test(tool.name)) throw new Error("Invalid tool name");
    if (tool.permission === "execute") throw new Error("Execute-level tools are not allowed in v0.1");
    if (this.tools.has(tool.name)) throw new Error("Duplicate tool name");
    this.tools.set(tool.name, tool as ToolDefinition);
    return this;
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /** Specs offered to the model: only registered tools on this workflow's allow-list. */
  specsFor(workflow: WorkflowName): ToolSpec[] {
    return WORKFLOW_TOOLS[workflow]
      .map((name) => this.tools.get(name))
      .filter((t): t is ToolDefinition => t !== undefined)
      .map((t) => ({ name: t.name, description: t.description, parameters: z.toJSONSchema(t.args) as Record<string, unknown> }));
  }
}
