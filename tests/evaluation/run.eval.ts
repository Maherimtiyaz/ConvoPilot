/**
 * Runs the v0.1 model evaluation against the configured Anthropic model and writes the results to
 * tests/evaluation/results/. Usage (key only in your shell or .env.local, never committed):
 *
 *   ANTHROPIC_API_KEY=… npm run eval            # optional: AI_MODEL=…, EVAL_MAX_USD=2
 *
 * The generic ANTHROPIC_BASE_URL is deliberately ignored: some environments (e.g. Claude Code in the
 * cloud) set it for their own use, and the key must go to the real Anthropic API. Use
 * EVAL_ANTHROPIC_BASE_URL only to point the run at a local mock.
 *
 * Synthetic data only. Writing quality is judged by a person from the saved drafts (rubric 1–5).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { costMicroUsd } from "@/lib/ai/pricing";
import { createAnthropicProvider } from "@/lib/ai/providers/anthropic";
import { analyzeEmailPrompt } from "@/lib/ai/workflows/analyze-thread";
import { extractCommitmentsPrompt } from "@/lib/ai/workflows/extract-commitments";

import { CASES, RETRIEVAL } from "./datasets/threads";
import { runEvaluation } from "./runner";
import { summarize } from "./score";

const key = process.env.ANTHROPIC_API_KEY;
const model = process.env.AI_MODEL || "claude-opus-5-5";
const maxUsd = Number(process.env.EVAL_MAX_USD || "2");

describe.skipIf(!key)("v0.1 model evaluation", () => {
  it("meets the v0.1 targets on the synthetic dataset", async () => {
    const provider = createAnthropicProvider({ apiKey: key!, model, baseURL: process.env.EVAL_ANTHROPIC_BASE_URL || undefined });
    const run = await runEvaluation(provider, CASES, RETRIEVAL, {
      stopWhen: (u) => costMicroUsd(model, u.inputTokens, u.outputTokens) >= maxUsd * 1_000_000,
      log: (line) => process.stdout.write(`  · ${line}\n`),
    });
    const metrics = summarize(run.cases, run.retrieval);
    const costUsd = costMicroUsd(model, run.usage.inputTokens, run.usage.outputTokens) / 1_000_000;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const dir = join(process.cwd(), "tests/evaluation/results");
    mkdirSync(dir, { recursive: true });
    const report = {
      date: new Date().toISOString(),
      provider: "anthropic",
      model,
      prompts: [`${analyzeEmailPrompt.id}@${analyzeEmailPrompt.version}`, `${extractCommitmentsPrompt.id}@${extractCommitmentsPrompt.version}`, "draft-reply@2", "ask-history@1"],
      usage: { ...run.usage, costUsd },
      metrics,
      cases: run.cases,
      retrieval: run.retrieval,
      policyDenials: run.policyDenials,
    };
    writeFileSync(join(dir, `${stamp}-${model}.json`), `${JSON.stringify(report, null, 2)}\n`);
    const lines = [
      `# Model evaluation — ${model} — ${report.date.slice(0, 10)}`,
      "",
      `Cost: $${costUsd.toFixed(2)} (${run.usage.calls} calls). Synthetic data only.`,
      "",
      "| Metric | Result | Target | Pass |",
      "| --- | --- | --- | --- |",
      ...metrics.map((m) => `| ${m.name} | ${m.value} | ${m.target} | ${m.pass ? "yes" : "**no**"} |`),
      "",
      "## Drafts for the writing-quality rubric (score each 1–5)",
      ...run.cases.map((c) => `\n### ${c.id}\n\n${c.error ? `_error: ${c.error}_` : c.draft.split("\n").map((l) => `> ${l}`).join("\n")}`),
      "",
      "## For review",
      ...run.cases.flatMap((c) => [
        ...c.commitments.extras.map((x) => `- ${c.id}: extra commitment proposed — ${x}`),
        ...c.commitments.ownerErrors.map((x) => `- ${c.id}: owner error — ${x}`),
        ...c.commitments.ambiguousDateViolations.map((x) => `- ${c.id}: date invented — ${x}`),
        ...c.forbidden.map((x) => `- ${c.id}: forbidden content shown — "${x}"`),
      ]),
      ...run.retrieval.filter((r) => !r.hit).map((r) => `- retrieval miss: "${r.question}" → ${r.status} ${r.citedCases.join(", ")}`),
    ];
    writeFileSync(join(dir, `${stamp}-${model}.md`), `${lines.join("\n")}\n`);
    process.stdout.write(`\n${lines.slice(0, 6 + metrics.length).join("\n")}\n`);
    expect(metrics.filter((m) => !m.pass).map((m) => m.name)).toEqual([]);
  });
});

describe.skipIf(Boolean(key))("v0.1 model evaluation (skipped)", () => {
  it("needs ANTHROPIC_API_KEY — set it in your shell or .env.local, never in the repository", () => {
    expect(key).toBeUndefined();
  });
});
