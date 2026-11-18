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

const textOf = (content) =>
  typeof content === "string" ? content : Array.isArray(content) ? content.map((b) => (typeof b.content === "string" ? b.content : (b.text ?? ""))).join("\n") : "";

/**
 * "Ask your history" tool loop: round 1 searches messages for the question's last word;
 * round 2 answers from the first result (quoting it exactly) or reports no record.
 */
function toolTurn(body) {
  const results = body.messages.filter((m) => Array.isArray(m.content) && m.content.some((b) => b.type === "tool_result"));
  if (results.length === 0) {
    const question = /([^\n]*\?)/.exec(textOf(body.messages[0]?.content))?.[1] ?? "";
    const keyword = question.replace(/[^\p{L}\s]/gu, " ").trim().split(/\s+/).at(-1) ?? "";
    return { tool: { name: "search_messages", input: { query: keyword || "nothing" } } };
  }
  const hit = /"ref":"(M\d+)"[^{}]*?"text":"((?:[^"\\]|\\.)*)"/.exec(textOf(results.at(-1).content));
  if (!hit) return { found: false, answer: "", citations: [] };
  const text = JSON.parse(`"${hit[2]}"`);
  return { found: true, answer: "You discussed the revised deck and its Friday deadline.", citations: [{ ref: hit[1], quote: text.split("\n")[0].slice(0, 30).trim() }] };
}

function reply(body) {
  if (body.tools?.length) return toolTurn(body);
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
    const out = reply(body);
    const content = out.tool ? [{ type: "tool_use", id: `toolu_mock_${calls}`, name: out.tool.name, input: out.tool.input }] : [{ type: "text", text: JSON.stringify(out) }];
    res.writeHead(200, { "content-type": "application/json" }).end(
      JSON.stringify({
        id: `msg_mock_${calls}`,
        type: "message",
        role: "assistant",
        model: body.model,
        content,
        stop_reason: out.tool ? "tool_use" : "end_turn",
        stop_sequence: null,
        usage: { input_tokens: 1200, output_tokens: 300 },
      }),
    );
  });
}).listen(PORT, "127.0.0.1");
