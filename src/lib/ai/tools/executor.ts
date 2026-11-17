import type { ToolCallRequest } from "../provider";
import type { AiContext } from "../types";
import { wrapUntrusted } from "../untrusted";

import { safeToolName, type AuditSink } from "./audit";
import { decide, type PolicyReason } from "./policy";
import type { ToolRegistry } from "./registry";

export type ToolOutcome =
  | { ok: true; toolCallId: string; name: string; content: string }
  | { ok: false; toolCallId: string; name: string; reason: PolicyReason | "tool_failed"; content: string };

/**
 * The only path from a model tool request to application code (docs/AGENT_DESIGN.md §2):
 * registry lookup → Zod-validate arguments → policy.decide → tool handler (service) →
 * result returned to the model as quoted, untrusted data. Every denial is audited.
 */
export async function executeToolCall(
  ctx: AiContext,
  call: ToolCallRequest,
  registry: ToolRegistry,
  audit: AuditSink,
  nonce: string,
): Promise<ToolOutcome> {
  const name = safeToolName(call.name);
  const deny = async (reason: PolicyReason): Promise<ToolOutcome> => {
    await audit.policyDenied(name, reason);
    return { ok: false, toolCallId: call.id, name, reason, content: `Tool request refused (${reason}).` };
  };

  const tool = registry.get(call.name);
  if (!tool) return deny("unknown_tool");

  const parsed = tool.args.safeParse(call.arguments);
  if (!parsed.success) return deny("invalid_arguments");

  const decision = decide(ctx, tool, parsed.data);
  if (!decision.allow) return deny(decision.reason);

  try {
    const result = await tool.run(ctx, parsed.data);
    const { text } = wrapUntrusted([{ label: "tool result", id: call.id, content: JSON.stringify(result) }], nonce);
    return { ok: true, toolCallId: call.id, name, content: text };
  } catch {
    // Handler errors are not passed to the model or logged with details.
    return { ok: false, toolCallId: call.id, name, reason: "tool_failed", content: "Tool failed. Continue without it." };
  }
}
