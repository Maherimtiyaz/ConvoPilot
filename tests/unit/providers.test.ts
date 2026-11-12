import { afterEach, describe, expect, it } from "vitest";
import { FakeProvider, OpenAICompatibleProvider, resolveProvider, resetProviderCache } from "@/lib/ai/providers";
import { ProviderError } from "@/lib/ai/providers/types";

describe("resolveProvider", () => {
  afterEach(() => {
    resetProviderCache();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    delete process.env.AI_PROVIDER;
    delete process.env.AI_MODEL;
    delete process.env.AI_BASE_URL;
    delete process.env.AI_API_KEY;
  });

  it("returns null when the app is not configured", () => {
    expect(resolveProvider()).toBeNull();
  });

  it("resolves the fake provider by default", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    const provider = resolveProvider();
    expect(provider?.id).toBe("fake");
  });

  it("rejects openai-compatible config missing credentials", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.AI_PROVIDER = "openai-compatible";
    expect(() => resolveProvider()).toThrow(ProviderError);
  });

  it("builds an OpenAI-compatible provider with credentials", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    process.env.AI_PROVIDER = "openai-compatible";
    process.env.AI_BASE_URL = "https://api.example.com/v1";
    process.env.AI_API_KEY = "key";
    process.env.AI_MODEL = "test-model";
    resetProviderCache();
    const provider = resolveProvider();
    expect(provider).toBeInstanceOf(OpenAICompatibleProvider);
    expect(provider?.model).toBe("test-model");
  });
});

describe("FakeProvider", () => {
  const provider = new FakeProvider({
    scriptedResponses: { "follow-up": "Here is a follow-up draft." },
    defaultResponse: "Default reply.",
  });

  it("returns a scripted response when the input matches", async () => {
    const response = await provider.complete({
      messages: [{ role: "user", content: "Please draft a follow-up to Sahin" }],
    });
    expect(response.content).toBe("Here is a follow-up draft.");
    expect(response.providerId).toBe("fake");
  });

  it("falls back to the default response", async () => {
    const response = await provider.complete({
      messages: [{ role: "user", content: "Unrelated input" }],
    });
    expect(response.content).toBe("Default reply.");
  });

  it("streams the response in chunks", async () => {
    const chunks: string[] = [];
    for await (const chunk of provider.stream({
      messages: [{ role: "user", content: "Unrelated input" }],
    })) {
      chunks.push(chunk.delta);
    }
    expect(chunks.join("")).toBe("Default reply.");
  });

  it("embeds input deterministically with the configured dimension", async () => {
    const result = await provider.embed({ input: "hello" });
    expect(result.vectors).toHaveLength(1);
    expect(result.vectors[0]).toHaveLength(1536);
    const again = await provider.embed({ input: "hello" });
    expect(again.vectors[0]).toEqual(result.vectors[0]);
  });
});
