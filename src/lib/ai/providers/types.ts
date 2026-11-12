export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  /** JSON-mode hint for structured output; providers that support it enforce it. */
  responseFormat?: { type: "json_object" };
}

export interface ChatUsage {
  promptTokens?: number;
  completionTokens?: number;
}

export interface ChatResponse {
  content: string;
  providerId: string;
  model: string;
  usage?: ChatUsage;
}

export interface ChatChunk {
  delta: string;
}

export interface EmbedRequest {
  input: string | string[];
}

export interface EmbedResponse {
  vectors: number[][];
  model: string;
}

export interface ChatProvider {
  readonly id: string;
  readonly model: string;
  readonly supportsEmbeddings: boolean;
  complete(request: ChatRequest): Promise<ChatResponse>;
  stream(request: ChatRequest): AsyncIterable<ChatChunk>;
  embed?(request: EmbedRequest): Promise<EmbedResponse>;
}

export class ProviderError extends Error {
  readonly providerId: string;
  readonly retryable: boolean;

  constructor(providerId: string, message: string, retryable = false) {
    super(`[${providerId}] ${message}`);
    this.name = "ProviderError";
    this.providerId = providerId;
    this.retryable = retryable;
  }
}
