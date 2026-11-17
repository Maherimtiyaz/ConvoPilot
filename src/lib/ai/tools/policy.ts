import type { AiContext } from "../types";

import { WORKFLOW_TOOLS, type ToolDefinition } from "./registry";

export type PolicyReason = "unknown_tool" | "invalid_arguments" | "execute_forbidden" | "not_allowed_in_workflow" | "workspace_mismatch";

export type PolicyDecision = { allow: true } | { allow: false; reason: PolicyReason };

/**
 * Deterministic policy check (layer 2 of 3, docs/SECURITY.md). Runs after argument validation
 * and before any service call. Pure: same inputs, same answer; no model involvement.
 */
export function decide(ctx: AiContext, tool: ToolDefinition, args: unknown): PolicyDecision {
  if (tool.permission === "execute") return { allow: false, reason: "execute_forbidden" };
  if (!WORKFLOW_TOOLS[ctx.workflow].includes(tool.name)) return { allow: false, reason: "not_allowed_in_workflow" };
  if (args !== null && typeof args === "object" && "workspaceId" in args && (args as { workspaceId: unknown }).workspaceId !== ctx.workspaceId) {
    return { allow: false, reason: "workspace_mismatch" };
  }
  return { allow: true };
}
