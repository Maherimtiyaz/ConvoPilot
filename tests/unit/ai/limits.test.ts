import { describe, expect, it } from "vitest";

import { DEFAULT_BUDGETS, estimateTokens, WORST_CASE_OUTPUT_TOKENS } from "@/lib/ai/budget";
import { AI_ACTION_DEADLINE_MS, AI_CALL_TIMEOUT_MS, AI_INPUT_CHAR_LIMIT, AI_PAGE_MAX_DURATION_SECONDS, latestForAi } from "@/lib/ai/limits";
import { costMicroUsd } from "@/lib/ai/pricing";

const msg = (n: number, chars: number) => ({ id: n, body: "x".repeat(chars) });

describe("latestForAi", () => {
  it("keeps everything when the conversation fits", () => {
    const all = [msg(1, 100), msg(2, 100)];
    expect(latestForAi(all)).toEqual(all);
  });

  it("keeps the newest messages that fit, in order", () => {
    const all = [msg(1, 30_000), msg(2, 30_000), msg(3, 15_000), msg(4, 15_000)];
    expect(latestForAi(all).map((m) => m.id)).toEqual([3, 4]);
  });

  it("always keeps at least the newest message", () => {
    expect(latestForAi([msg(1, 10), msg(2, 60_000)]).map((m) => m.id)).toEqual([2]);
    expect(latestForAi([])).toEqual([]);
  });
});

describe("AI limits fit together", () => {
  it("a full-size conversation plus a repair round fits each workflow's budget", () => {
    const prompt = estimateTokens("x".repeat(AI_INPUT_CHAR_LIMIT)) + 3_000; // instructions, schema, delimiters
    for (const [workflow, output] of [["analyzeThread", 8_000], ["draftReply", 6_000], ["extractCommitments", 6_000]] as const) {
      const firstCall = prompt + output;
      const repairCall = prompt + output + 200 + output; // resends prompt and answer, plus a new answer
      expect(firstCall + repairCall, workflow).toBeLessThanOrEqual(DEFAULT_BUDGETS[workflow]);
    }
  });

  it("each action's worst-case cost stays under the $1/day cap", () => {
    for (const workflow of Object.keys(DEFAULT_BUDGETS) as (keyof typeof DEFAULT_BUDGETS)[]) {
      const out = WORST_CASE_OUTPUT_TOKENS[workflow];
      expect(costMicroUsd("claude-opus-5-5", DEFAULT_BUDGETS[workflow] - out, out), workflow).toBeLessThan(1_000_000);
    }
  });

  it("time limits nest: call < action deadline < page limit", () => {
    expect(AI_CALL_TIMEOUT_MS).toBeLessThan(AI_ACTION_DEADLINE_MS);
    expect(AI_ACTION_DEADLINE_MS).toBeLessThan(AI_PAGE_MAX_DURATION_SECONDS * 1000);
  });
});

describe("pages whose actions call the AI declare the hosting time limit", () => {
  it.each(["src/app/app/studio/page.tsx", "src/app/app/conversations/page.tsx", "src/app/app/contacts/[id]/page.tsx"])("%s", async (path) => {
    const { readFile } = await import("node:fs/promises");
    expect(await readFile(path, "utf8")).toContain(`export const maxDuration = ${AI_PAGE_MAX_DURATION_SECONDS};`);
  });
});
