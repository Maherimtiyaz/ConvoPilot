import { getServerEnv } from "@/lib/validation/env";
import { FakeProvider } from "./fake";
import { OpenAICompatibleProvider } from "./openai-compatible";
import { ChatProvider, ProviderError } from "./types";

export * from "./types";
export { FakeProvider, OpenAICompatibleProvider };

let cached: ChatProvider | null | undefined;

/**
 * Resolves the configured chat provider from environment configuration.
 * Business logic must always call this instead of importing a provider SDK.
 * Returns null when Supabase/app env is not configured at all.
 */
export function resolveProvider(): ChatProvider | null {
  if (cached !== undefined) return cached;

  const env = getServerEnv();
  if (!env) {
    cached = null;
    return cached;
  }

  switch (env.AI_PROVIDER) {
    case "openai-compatible": {
      if (!env.AI_API_KEY || !env.AI_BASE_URL) {
        throw new ProviderError(
          "openai-compatible",
          "AI_API_KEY and AI_BASE_URL are required when AI_PROVIDER=openai-compatible",
        );
      }
      cached = new OpenAICompatibleProvider({
        id: "openai-compatible",
        model: env.AI_MODEL,
        baseUrl: env.AI_BASE_URL,
        apiKey: env.AI_API_KEY,
        embeddingModel: env.AI_EMBEDDING_MODEL,
      });
      break;
    }
    case "anthropic":
    case "gemini":
    case "ollama":
      // Adapters are added when a provider key is actually available.
      // Until then they fall back to the fake provider so the app still runs.
      cached = new FakeProvider({ model: env.AI_MODEL });
      break;
    case "fake":
    default:
      cached = new FakeProvider({ model: env.AI_MODEL });
      break;
  }

  return cached;
}

/** Test-only helper to reset the cached provider between tests. */
export function resetProviderCache(): void {
  cached = undefined;
}
