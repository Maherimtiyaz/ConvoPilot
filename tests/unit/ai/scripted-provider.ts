/**
 * Deterministic, scripted AI provider for tests ONLY (AGENTS.md §3.9). Never imported from src/.
 * Each generate() call returns the next scripted step; requests are recorded for assertions.
 */
import { ProviderError } from "@/lib/ai/errors";
import type { AiProvider, GenerateRequest, GenerateResult, ToolCallRequest } from "@/lib/ai/provider";

export type Step =
  | { text: string; toolCalls?: ToolCallRequest[]; inputTokens?: number; outputTokens?: number }
  | { error: ProviderError }
  | { hang: true };

export class ScriptedProvider implements AiProvider {
  readonly id = "test";
  readonly requests: GenerateRequest[] = [];
  private index = 0;

  constructor(private readonly steps: Step[]) {}

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    this.requests.push(structuredClone(request));
    const step = this.steps[this.index++];
    if (!step) throw new Error("ScriptedProvider ran out of steps");
    if ("error" in step) throw step.error;
    if ("hang" in step) return new Promise(() => {});
    return {
      text: step.text,
      toolCalls: step.toolCalls ?? [],
      usage: { inputTokens: step.inputTokens ?? 100, outputTokens: step.outputTokens ?? 50 },
      model: "scripted-1",
      finishReason: step.toolCalls?.length ? "tool_calls" : "stop",
    };
  }

  get calls(): number {
    return this.index;
  }
}
