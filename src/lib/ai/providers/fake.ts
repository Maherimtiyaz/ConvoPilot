import {
  ChatProvider,
  ChatRequest,
  ChatResponse,
  ChatChunk,
  EmbedRequest,
  EmbedResponse,
} from "./types";

export interface FakeProviderConfig {
  /** Deterministic canned responses, keyed by a substring of the last user message. */
  readonly scriptedResponses?: Readonly<Record<string, string>>;
  readonly defaultResponse?: string;
  readonly embeddingDimension?: number;
  readonly model?: string;
}

function hashVector(input: string, dimension: number): number[] {
  let hash = 2166136261;
  const vector: number[] = [];
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
    vector.push(((hash >>> 0) % 1000) / 1000);
  }
  while (vector.length < dimension) {
    vector.push(((hash >>> 0) % 1000) / 1000);
    hash = Math.imul(hash + vector.length, 2654435761);
  }
  return vector.slice(0, dimension);
}

/**
 * Deterministic provider for tests and local development without API keys.
 * Never used in production: resolveProvider() only selects it when
 * AI_PROVIDER=fake or when no provider is configured.
 */
export class FakeProvider implements ChatProvider {
  readonly id = "fake";
  readonly model: string;
  readonly supportsEmbeddings = true;

  private readonly scriptedResponses: Readonly<Record<string, string>>;
  private readonly defaultResponse: string;
  private readonly embeddingDimension: number;

  constructor(config: FakeProviderConfig = {}) {
    this.scriptedResponses = config.scriptedResponses ?? {};
    this.defaultResponse = config.defaultResponse ?? "";
    this.embeddingDimension = config.embeddingDimension ?? 1536;
    this.model = config.model ?? "fake-model";
  }

  async complete(request: ChatRequest): Promise<ChatResponse> {
    const lastUser = [...request.messages].reverse().find((m) => m.role === "user");
    const input = lastUser?.content ?? "";

    const match = Object.entries(this.scriptedResponses).find(([key]) => input.includes(key));
    const content = match ? match[1] : this.defaultResponse;

    return {
      content,
      providerId: this.id,
      model: this.model,
      usage: { promptTokens: input.length, completionTokens: content.length },
    };
  }

  async *stream(request: ChatRequest): AsyncIterable<ChatChunk> {
    const response = await this.complete(request);
    for (const word of response.content.split(/(\s+)/)) {
      if (word) yield { delta: word };
    }
  }

  async embed(request: EmbedRequest): Promise<EmbedResponse> {
    const inputs = Array.isArray(request.input) ? request.input : [request.input];
    return {
      vectors: inputs.map((input) => hashVector(input, this.embeddingDimension)),
      model: "fake-embedding",
    };
  }
}
