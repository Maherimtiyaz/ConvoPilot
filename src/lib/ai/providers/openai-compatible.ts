import {
  ChatProvider,
  ChatRequest,
  ChatResponse,
  ChatChunk,
  EmbedRequest,
  EmbedResponse,
  ProviderError,
} from "./types";

interface OpenAIChatChoice {
  message?: { content?: string | null };
}

interface OpenAIChatResponse {
  choices?: OpenAIChatChoice[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

interface OpenAIEmbedResponse {
  data?: { embedding: number[] }[];
}

/**
 * Works with any OpenAI-compatible API (OpenAI, Groq, Together, OpenRouter,
 * LM Studio, vLLM, ...). Base URL and key come from env, never hardcoded.
 */
export class OpenAICompatibleProvider implements ChatProvider {
  readonly id: string;
  readonly model: string;
  readonly supportsEmbeddings: boolean;

  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly embeddingModel?: string;

  constructor(config: {
    id: string;
    model: string;
    baseUrl: string;
    apiKey: string;
    embeddingModel?: string;
  }) {
    this.id = config.id;
    this.model = config.model;
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.apiKey = config.apiKey;
    this.embeddingModel = config.embeddingModel;
    this.supportsEmbeddings = Boolean(config.embeddingModel);
  }

  async complete(request: ChatRequest): Promise<ChatResponse> {
    const response = await this.fetchJson<OpenAIChatResponse>("/chat/completions", {
      model: this.model,
      messages: request.messages,
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      ...(request.responseFormat ? { response_format: request.responseFormat } : {}),
    });

    const content = response.choices?.[0]?.message?.content;
    if (typeof content !== "string") {
      throw new ProviderError(this.id, "Provider returned no message content");
    }

    return {
      content,
      providerId: this.id,
      model: this.model,
      usage: {
        promptTokens: response.usage?.prompt_tokens,
        completionTokens: response.usage?.completion_tokens,
      },
    };
  }

  async *stream(request: ChatRequest): AsyncIterable<ChatChunk> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        model: this.model,
        messages: request.messages,
        temperature: request.temperature,
        max_tokens: request.maxTokens,
        stream: true,
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!response.ok || !response.body) {
      throw new ProviderError(this.id, `Streaming request failed with status ${response.status}`, response.status >= 500);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") return;
        try {
          const parsed = JSON.parse(payload) as {
            choices?: { delta?: { content?: string } }[];
          };
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield { delta };
        } catch {
          throw new ProviderError(this.id, "Malformed SSE payload from provider");
        }
      }
    }
  }

  async embed(request: EmbedRequest): Promise<EmbedResponse> {
    if (!this.embeddingModel) {
      throw new ProviderError(this.id, "This provider has no embedding model configured");
    }

    const inputs = Array.isArray(request.input) ? request.input : [request.input];
    const response = await this.fetchJson<OpenAIEmbedResponse>("/embeddings", {
      model: this.embeddingModel,
      input: inputs,
    });

    const vectors = (response.data ?? []).map((d) => d.embedding);
    if (vectors.length !== inputs.length) {
      throw new ProviderError(this.id, "Embedding response count mismatch");
    }

    return { vectors, model: this.embeddingModel };
  }

  private headers(): HeadersInit {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  private async fetchJson<T>(path: string, body: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (error) {
      throw new ProviderError(
        this.id,
        `Network error contacting provider: ${error instanceof Error ? error.message : String(error)}`,
        true,
      );
    }

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      // Log only status, never the request body (may contain user content).
      console.error(`[ai_provider] ${this.id} ${path} failed with status ${response.status}`);
      throw new ProviderError(
        this.id,
        `Provider request failed with status ${response.status}. ${bodyText.slice(0, 200)}`,
        response.status >= 500 || response.status === 429,
      );
    }

    return (await response.json()) as T;
  }
}
