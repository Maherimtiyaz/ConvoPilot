import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { TokenBudget } from "@/lib/ai/budget";
import { runToolLoop } from "@/lib/ai/tool-loop";
import type { AuditSink } from "@/lib/ai/tools/audit";
import { executeToolCall } from "@/lib/ai/tools/executor";
import { decide } from "@/lib/ai/tools/policy";
import { ToolRegistry, type ToolDefinition } from "@/lib/ai/tools/registry";
import type { AiContext, WorkflowName } from "@/lib/ai/types";

import { ScriptedProvider } from "./scripted-provider";

const ctx = (workflow: WorkflowName): AiContext => ({ userId: "u1", email: "u@example.com", workspaceId: "ws-1", role: "owner", workflow });

function fixtures() {
  const searchMessages = vi.fn(async (_c: AiContext, args: { query: string }) => [{ id: "m1", snippet: `about ${args.query}` }]);
  const draft = vi.fn(async () => ({ id: "d1", status: "draft" }));
  const registry = new ToolRegistry()
    .register({ name: "search_messages", description: "Search messages", permission: "read", args: z.object({ query: z.string().min(1).max(200) }).strict(), run: searchMessages })
    .register({ name: "draft_reply", description: "Draft a reply", permission: "propose", args: z.object({ conversationId: z.string(), workspaceId: z.string().optional() }).strict(), run: draft });
  const denied: { tool: string; reason: string }[] = [];
  const audit: AuditSink = { policyDenied: async (tool, reason) => void denied.push({ tool, reason }) };
  return { registry, audit, denied, searchMessages, draft };
}

describe("ToolRegistry", () => {
  it("refuses execute-level tools, bad names and duplicates", () => {
    const r = new ToolRegistry();
    const base: ToolDefinition = { name: "send_email", description: "", permission: "execute", args: z.object({}), run: async () => null };
    expect(() => r.register(base)).toThrow(/Execute-level/);
    expect(() => r.register({ ...base, permission: "read", name: "Bad Name" })).toThrow();
    r.register({ ...base, permission: "read", name: "ok_tool" });
    expect(() => r.register({ ...base, permission: "read", name: "ok_tool" })).toThrow(/Duplicate/);
  });

  it("offers only allow-listed, registered tools per workflow", () => {
    const { registry } = fixtures();
    expect(registry.specsFor("askHistory").map((t) => t.name)).toEqual(["search_messages"]);
    expect(registry.specsFor("draftReply").map((t) => t.name)).toEqual(["draft_reply"]);
    expect(registry.specsFor("proposeMemories")).toEqual([]);
    expect(registry.specsFor("askHistory")[0].parameters).toMatchObject({ type: "object" });
  });
});

describe("policy.decide", () => {
  it("is deterministic and checks workflow and workspace", () => {
    const { registry } = fixtures();
    const draft = registry.get("draft_reply")!;
    expect(decide(ctx("draftReply"), draft, { conversationId: "c1" })).toEqual({ allow: true });
    expect(decide(ctx("askHistory"), draft, { conversationId: "c1" })).toEqual({ allow: false, reason: "not_allowed_in_workflow" });
    expect(decide(ctx("draftReply"), draft, { conversationId: "c1", workspaceId: "ws-2" })).toEqual({ allow: false, reason: "workspace_mismatch" });
    expect(decide(ctx("draftReply"), { ...draft, permission: "execute" }, {})).toEqual({ allow: false, reason: "execute_forbidden" });
  });
});

describe("executeToolCall", () => {
  it("runs an allowed call and returns the result as quoted untrusted data", async () => {
    const { registry, audit, denied, searchMessages } = fixtures();
    const out = await executeToolCall(ctx("askHistory"), { id: "c1", name: "search_messages", arguments: { query: "deck" } }, registry, audit, "N");
    expect(out).toMatchObject({ ok: true, name: "search_messages" });
    expect(out.content).toMatch(/^<<<UNTRUSTED N tool result id="c1">>>\n[\s\S]*about deck[\s\S]*\n<<<END N>>>$/);
    expect(searchMessages).toHaveBeenCalledOnce();
    expect(denied).toEqual([]);
  });

  it("denies and audits unknown tools, bad arguments and out-of-workflow tools without running them", async () => {
    const { registry, audit, denied, searchMessages, draft } = fixtures();
    const c = ctx("askHistory");
    await executeToolCall(c, { id: "1", name: "send_email", arguments: { to: "x" } }, registry, audit, "N");
    await executeToolCall(c, { id: "2", name: "search_messages", arguments: { query: "", sql: "drop table" } }, registry, audit, "N");
    await executeToolCall(c, { id: "3", name: "draft_reply", arguments: { conversationId: "c1" } }, registry, audit, "N");
    await executeToolCall(c, { id: "4", name: "<script>", arguments: {} }, registry, audit, "N");
    expect(denied).toEqual([
      { tool: "send_email", reason: "unknown_tool" },
      { tool: "search_messages", reason: "invalid_arguments" },
      { tool: "draft_reply", reason: "not_allowed_in_workflow" },
      { tool: "unknown", reason: "unknown_tool" },
    ]);
    expect(searchMessages).not.toHaveBeenCalled();
    expect(draft).not.toHaveBeenCalled();
  });

  it("hides handler failures from the model", async () => {
    const { audit } = fixtures();
    const registry = new ToolRegistry().register({ name: "search_messages", description: "", permission: "read", args: z.object({}), run: async () => { throw new Error("db password=hunter2"); } });
    const out = await executeToolCall(ctx("askHistory"), { id: "1", name: "search_messages", arguments: {} }, registry, audit, "N");
    expect(out).toMatchObject({ ok: false, reason: "tool_failed" });
    expect(out.content).not.toContain("hunter2");
  });
});

describe("runToolLoop", () => {
  const call = (id: string) => ({ id, name: "search_messages", arguments: { query: "deck" } });
  const base = (provider: ScriptedProvider, budget = new TokenBudget(50_000)) => {
    const { registry, audit } = fixtures();
    return { provider, ctx: ctx("askHistory"), registry, audit, budget, system: "Answer from the user's history.", user: "What did I promise Priya?", nonce: "N" };
  };

  it("answers after tool rounds, feeding results back as tool messages", async () => {
    const p = new ScriptedProvider([{ text: "", toolCalls: [call("a")] }, { text: "You promised the deck by Friday [m1]." }]);
    const r = await runToolLoop(base(p));
    expect(r).toEqual({ status: "answered", text: "You promised the deck by Friday [m1].", rounds: 1, model: "scripted-1", usage: { inputTokens: 200, outputTokens: 100 } });
    const last = p.requests[1].messages;
    expect(last.at(-1)).toMatchObject({ role: "tool", toolCallId: "a" });
    expect(p.requests[0].tools?.map((t) => t.name)).toEqual(["search_messages"]);
  });

  it("stops after 4 tool rounds with a typed incomplete result", async () => {
    const p = new ScriptedProvider(Array.from({ length: 6 }, (_, i) => ({ text: "", toolCalls: [call(`c${i}`)] })));
    const r = await runToolLoop(base(p));
    expect(r).toMatchObject({ status: "incomplete", reason: "max_rounds", rounds: 4 });
    expect(p.calls).toBe(5);
  });

  it("returns incomplete when the token budget runs out", async () => {
    const p = new ScriptedProvider([{ text: "", toolCalls: [call("a")], inputTokens: 2_000, outputTokens: 500 }, { text: "never" }]);
    const r = await runToolLoop(base(p, new TokenBudget(3_000)));
    expect(r).toMatchObject({ status: "incomplete", reason: "budget" });
  });

  it("is refused outside askHistory", async () => {
    const p = new ScriptedProvider([]);
    await expect(runToolLoop({ ...base(p), ctx: ctx("draftReply") })).rejects.toThrow(/only for askHistory/);
  });
});
