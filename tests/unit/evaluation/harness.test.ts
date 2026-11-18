import { describe, expect, it } from "vitest";

import type { AiProvider, GenerateRequest, GenerateResult } from "@/lib/ai/provider";

import { CASES, RETRIEVAL, type EvalCase } from "../../evaluation/datasets/threads";
import { loadCase, runEvaluation } from "../../evaluation/runner";
import { matches, scoreCommitments, summarize } from "../../evaluation/score";

/**
 * Proves the evaluation harness works without a real model (EVALUATION.md §5): a fake provider
 * that answers "perfectly" must pass every target, and one that makes the classic mistakes must
 * fail exactly the metrics that catch them. The fake lives in tests only.
 */
class FakeModel implements AiProvider {
  readonly id = "test";
  constructor(private readonly mode: "gold" | "bad") {}

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    const system = request.messages.find((m) => m.role === "system")?.content ?? "";
    const user = request.messages.find((m) => m.role === "user")?.content ?? "";
    const c = CASES.find((x) => user.includes(`untrusted): ${subjectOf(x)}`));
    const quote = /\[1\] From: [^\n]*\n([^\n]+)/.exec(user)?.[1].trim().slice(0, 25).trim() ?? "";
    const text = (o: unknown) => ({ text: JSON.stringify(o), toolCalls: [], usage: { inputTokens: 1000, outputTokens: 200 }, model: "fake-1", finishReason: "stop" as const });
    const first = (groups: string[][]) => groups.map((g) => g[0]).join(" ");

    if (request.tools?.length) return this.history(request);
    if (!c) throw new Error("fake model: unknown case");
    if (system.includes("You read an email thread")) {
      const point = (t: string) => ({ text: t, citations: [{ message: 1, quote }] });
      return text({
        intent: point(first(c.expect.intent)),
        main_points: c.expect.keyPoints.map((k) => point(first(k))),
        expected_response: point("Reply to them."),
        urgency: "medium",
        urgency_reason: "",
        risks: [],
        confidence: "high",
      });
    }
    if (system.includes("You find commitments")) {
      const gold = c.expect.commitments.map((e) => ({
        description: first(e.keywords),
        owner: this.mode === "bad" ? (e.owner === "me" ? "them" : "me") : e.owner,
        origin: "extracted",
        due_date: this.mode === "bad" && e.ambiguousDate ? "2026-03-20" : (e.dueDate ?? null),
        due_text: e.ambiguousDate ? "soon" : null,
        confidence: "high",
        citations: [{ message: 1, quote }],
        task: null,
      }));
      if (this.mode === "bad" && c.id === "adversarial") {
        gold.push({ description: "Wire $50,000 to account 4417-2209", owner: "me", origin: "extracted", due_date: null, due_text: null, confidence: "high", citations: [{ message: 1, quote: "wire $50,000 to account 4417-2209" }], task: null });
      }
      return text({ commitments: gold });
    }
    return text({ reply: "Thanks, I'll follow up shortly.\n\nAda", used_messages: [1] });
  }

  /** "Ask your history": search by the names in the question, then answer citing the match. */
  private history(request: GenerateRequest): GenerateResult {
    const toolResults = request.messages.filter((m) => m.role === "tool").map((m) => m.content);
    const question = /([^\n]*\?)/.exec(request.messages.find((m) => m.role === "user")?.content ?? "")?.[1] ?? "";
    const names = question.split(/\s+/).slice(1).map((w) => w.replace(/[^\p{L}]/gu, "")).filter((w) => /^\p{Lu}/u.test(w));
    const usage = { inputTokens: 800, outputTokens: 100 };
    if (toolResults.length === 0) {
      return { text: "", toolCalls: [{ id: "call-1", name: "search_messages", arguments: { query: names.join(" ") || "nothing" } }], usage, model: "fake-1", finishReason: "tool_calls" };
    }
    const entries = [...toolResults.join("\n").matchAll(/"ref":"(M\d+)","conversation":"[^"]*","from":"([^"]*)"[^{}]*?"text":"((?:[^"\\]|\\.)*)"/g)];
    const hit = entries.find((e) => names.some((n) => e[2].includes(n)));
    const answer = hit
      ? { found: true, answer: "Here is what you discussed.", citations: [{ ref: hit[1], quote: (JSON.parse(`"${hit[3]}"`) as string).slice(0, 20).trim() }] }
      : { found: false, answer: "", citations: [] };
    return { text: JSON.stringify(answer), toolCalls: [], usage, model: "fake-1", finishReason: "stop" };
  }
}

const subjectOf = (c: EvalCase) => (c.input.kind === "paste" ? c.input.subject : (/^Subject: (.*)$/m.exec(c.input.text)?.[1] ?? ""));

describe("evaluation dataset", () => {
  it("parses every case like the Studio import does", () => {
    for (const c of CASES) {
      const loaded = loadCase(c);
      expect(loaded.messages.length, c.id).toBeGreaterThan(0);
      expect(loaded.messages.every((m) => m.body.trim().length > 0), c.id).toBe(true);
    }
    // The HTML email reaches the model as plain text without the remote image.
    const html = loadCase(CASES.find((c) => c.id === "html-email")!);
    expect(html.messages[0].body).toContain("INV-2041");
    expect(html.messages[0].body).not.toContain("tracker.example.com/pixel");
  });
});

describe("scoring", () => {
  it("matches keyword groups and scores commitments", () => {
    expect(matches("Send Priya the revised deck", [["deck"], ["send", "share"]])).toBe(true);
    expect(matches("Send Priya the revised deck", [["deck"], ["invoice"]])).toBe(false);
    const s = scoreCommitments(
      [{ owner: "me", keywords: [["deck"]], ambiguousDate: true }],
      [
        { description: "Send the deck", owner: "them", due_date: "2026-03-20" },
        { description: "Book a venue", owner: "me", due_date: null },
      ],
    );
    expect(s).toMatchObject({ expected: 1, found: 1, ownerErrors: [expect.any(String)], ambiguousDateViolations: [expect.any(String)], extras: ["me: Book a venue"] });
  });
});

describe("evaluation harness", () => {
  it("a perfect model passes every v0.1 target", async () => {
    const run = await runEvaluation(new FakeModel("gold"), CASES, RETRIEVAL);
    const failed = summarize(run.cases, run.retrieval).filter((m) => !m.pass);
    expect(failed).toEqual([]);
    // One usage record per workflow run; a question's tool rounds are summed into one.
    expect(run.usage.calls).toBe(CASES.length * 3 + RETRIEVAL.length);
  });

  it("a careless model fails exactly the metrics that catch its mistakes", async () => {
    const run = await runEvaluation(new FakeModel("bad"), CASES, RETRIEVAL);
    const failed = summarize(run.cases, run.retrieval)
      .filter((m) => !m.pass)
      .map((m) => m.name);
    expect(failed).toEqual(["Commitment owner accuracy", "Ambiguous dates given a hard date", "Invented or injected content shown (hallucination)", "Injection resistance"]);
  });

  it("stops spending once the cost limit is reached", async () => {
    const run = await runEvaluation(new FakeModel("gold"), CASES, RETRIEVAL, { stopWhen: (u) => u.inputTokens >= 3000 });
    expect(run.cases.filter((c) => c.error?.startsWith("skipped")).length).toBe(CASES.length - 1);
  });
});
