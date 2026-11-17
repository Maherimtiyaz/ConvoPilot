// Local stand-in for the Anthropic Messages API, for end-to-end tests ONLY (AGENTS.md §3.9).
// The real adapter (src/lib/ai/providers/anthropic.ts) talks to it via ANTHROPIC_BASE_URL.
// It answers with deterministic JSON that cites message [1] using text copied from that message.
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_ANTHROPIC_PORT ?? 4010);
const KEY = "e2e-placeholder-not-a-secret";
let calls = 0;

function firstMessageQuote(userText) {
  const m = /\[1\] From: [^\n]*\n([^\n]+)/.exec(userText);
  return m ? m[1].trim().slice(0, 40).trim() : "";
}

function reply(body) {
  const system = typeof body.system === "string" ? body.system : "";
  const user = body.messages?.map((m) => (typeof m.content === "string" ? m.content : "")).join("\n") ?? "";
  const quote = firstMessageQuote(user);
  if (system.includes("You read an email thread")) {
    return {
      intent: { text: "They want the revised deck by Friday.", citations: [{ message: 1, quote }] },
      main_points: [
        { text: "The deck is due Friday.", citations: [{ message: 1, quote }] },
        { text: "An invented point with no evidence.", citations: [{ message: 1, quote: "words that are not in the message" }] },
      ],
      expected_response: { text: "Confirm you will send the deck by Friday.", citations: [{ message: 1, quote }] },
      urgency: "high",
      urgency_reason: "Friday deadline",
      risks: [],
      confidence: "high",
    };
  }
  if (system.includes("You draft the user's reply")) {
    return { reply: "Hi Priya,\n\nYes, you'll have the revised deck by Friday.\n\nBest,\nAda", used_messages: [1] };
  }
  return {};
}

createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true, calls }));
    return;
  }
  if (req.method !== "POST" || !req.url?.startsWith("/v1/messages")) {
    res.writeHead(404).end();
    return;
  }
  // SDK 1.x sends the key as "Authorization: Bearer <key>"; older clients used x-api-key.
  const presented = req.headers["x-api-key"] ?? (req.headers.authorization ?? "").replace(/^Bearer /, "");
  if (presented !== KEY) {
    res.writeHead(401, { "content-type": "application/json" }).end(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }));
    return;
  }
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    calls += 1;
    const body = JSON.parse(raw || "{}");
    const text = JSON.stringify(reply(body));
    res.writeHead(200, { "content-type": "application/json" }).end(
      JSON.stringify({
        id: `msg_mock_${calls}`,
        type: "message",
        role: "assistant",
        model: body.model,
        content: [{ type: "text", text }],
        stop_reason: "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 1200, output_tokens: 300 },
      }),
    );
  });
}).listen(PORT, "127.0.0.1");
