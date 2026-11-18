/**
 * Model-evaluation runner (docs/EVALUATION.md §5): runs the real workflows on the synthetic
 * dataset with any AiProvider and scores the results. Used by run.eval.ts with Anthropic, and by a
 * CI unit test with a fake provider to prove the harness itself works.
 */
import { randomUUID } from "node:crypto";

import { DEFAULT_BUDGETS, TokenBudget } from "@/lib/ai/budget";
import type { AiProvider } from "@/lib/ai/provider";
import type { AuditSink } from "@/lib/ai/tools/audit";
import type { TokenUsage } from "@/lib/ai/types";
import { analyzeThread } from "@/lib/ai/workflows/analyze-thread";
import { askHistory, type HistoryMessage, type HistorySource } from "@/lib/ai/workflows/ask-history";
import { draftReply } from "@/lib/ai/workflows/draft-reply";
import { extractCommitments } from "@/lib/ai/workflows/extract-commitments";
import type { ThreadMessage } from "@/lib/ai/workflows/thread-input";
import { parseFile, parsePastedText } from "@/lib/conversations/parse";

import { OWNER, type EvalCase, type RetrievalCase } from "./datasets/threads";
import { forbiddenHits, keyPointsFound, matches, scoreCommitments, type CaseResult, type RetrievalResult } from "./score";

const WORKSPACE = "eval-workspace";

export interface LoadedCase {
  c: EvalCase;
  subject: string;
  messages: ThreadMessage[];
}

/** Parses a case exactly as the Studio import does (direction from the user's own address). */
export function loadCase(c: EvalCase): LoadedCase {
  const parsed = c.input.kind === "paste" ? parsePastedText(c.input.text) : parseFile(c.input.fileName, new TextEncoder().encode(c.input.text));
  if (!parsed.ok) throw new Error(`case ${c.id} did not parse: ${parsed.error}`);
  const subject = (c.input.kind === "paste" ? c.input.subject : null) ?? parsed.thread.subject ?? "(no subject)";
  const messages: ThreadMessage[] = parsed.thread.messages.map((m, i) => ({
    id: `${c.id}#${i + 1}`,
    workspaceId: WORKSPACE,
    position: i + 1,
    direction: m.senderEmail ? (m.senderEmail.toLowerCase() === OWNER.email ? "outbound" : "inbound") : "unknown",
    senderName: m.senderName,
    senderEmail: m.senderEmail,
    sentAt: m.sentAt,
    body: m.body,
  }));
  return { c, subject, messages };
}

/** In-memory stand-in for the database-backed history source, with naive keyword ranking. */
export function memoryHistorySource(cases: LoadedCase[]): HistorySource {
  const all: HistoryMessage[] = cases.flatMap(({ c, subject, messages }) =>
    messages.map((m) => ({ id: m.id, workspaceId: WORKSPACE, conversationId: c.id, subject, position: m.position, senderName: m.senderName, senderEmail: m.senderEmail, sentAt: m.sentAt, body: m.body })),
  );
  const people = new Map<string, { id: string; name: string; emails: string[] }>();
  for (const m of all) {
    if (!m.senderEmail || m.senderEmail === OWNER.email) continue;
    if (!people.has(m.senderEmail)) people.set(m.senderEmail, { id: randomUUID(), name: m.senderName ?? m.senderEmail, emails: [m.senderEmail] });
  }
  const words = (q: string) => q.toLowerCase().split(/[^\p{L}\p{N}@.]+/u).filter((w) => w.length > 2);
  const conversationsOf = (contactId: string) => {
    const p = [...people.values()].find((x) => x.id === contactId);
    return p ? new Set(all.filter((m) => m.senderEmail === p.emails[0]).map((m) => m.conversationId)) : new Set<string>();
  };
  return {
    async searchContacts(query) {
      const w = words(query);
      return [...people.values()].filter((p) => w.some((x) => p.name.toLowerCase().includes(x) || p.emails[0].includes(x))).map((p) => ({ ...p, company: null }));
    },
    async contactHistory(contactId) {
      const convs = conversationsOf(contactId);
      if (convs.size === 0) return null;
      const msgs = all.filter((m) => convs.has(m.conversationId));
      return {
        conversations: [...convs].map((id) => ({ id, subject: msgs.find((m) => m.conversationId === id)!.subject, lastMessageAt: null })),
        recentMessages: msgs.slice(-8),
      };
    },
    async searchMessages(query, contactId) {
      const w = words(query);
      const allowed = contactId ? conversationsOf(contactId) : null;
      return all
        .filter((m) => !allowed || allowed.has(m.conversationId))
        .map((m) => ({ m, score: w.filter((x) => `${m.subject} ${m.senderName ?? ""} ${m.body}`.toLowerCase().includes(x)).length }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)
        .map((x) => x.m);
    },
  };
}

export interface EvalRun {
  cases: CaseResult[];
  retrieval: RetrievalResult[];
  usage: TokenUsage & { calls: number };
  policyDenials: string[];
}

export async function runEvaluation(
  provider: AiProvider,
  cases: EvalCase[],
  retrieval: RetrievalCase[],
  options: { stopWhen?: (usage: TokenUsage) => boolean; log?: (line: string) => void } = {},
): Promise<EvalRun> {
  const usage = { inputTokens: 0, outputTokens: 0, calls: 0 };
  const add = (u: TokenUsage) => {
    usage.inputTokens += u.inputTokens;
    usage.outputTokens += u.outputTokens;
    usage.calls += 1;
  };
  const log = options.log ?? (() => undefined);
  const loaded = cases.map(loadCase);
  const results: CaseResult[] = [];

  for (const { c, subject, messages } of loaded) {
    if (options.stopWhen?.(usage)) {
      results.push(blank(c, "skipped: evaluation cost limit reached"));
      continue;
    }
    log(`case ${c.id}`);
    try {
      const a = await analyzeThread(provider, { subject, messages, owner: OWNER }, new TokenBudget(DEFAULT_BUDGETS.analyzeThread));
      add(a.metadata.usage);
      const x = await extractCommitments(provider, { subject, messages, owner: OWNER }, new TokenBudget(DEFAULT_BUDGETS.extractCommitments));
      add(x.metadata.usage);
      const d = await draftReply(provider, { subject, messages, owner: OWNER, style: { signOff: "Ada" }, options: { tone: "warm", length: "short" } }, new TokenBudget(DEFAULT_BUDGETS.draftReply));
      add(d.metadata.usage);

      const factual = [a.analysis.intent, ...a.analysis.mainPoints, a.analysis.expectedResponse].flatMap((p) => (p ? [p.text] : []));
      results.push({
        id: c.id,
        intentOk: a.analysis.intent !== null && matches(a.analysis.intent.text, c.expect.intent),
        keyPointsFound: keyPointsFound(factual, c.expect.keyPoints),
        keyPointsTotal: c.expect.keyPoints.length,
        unsupportedDropped: a.analysis.droppedUnsupported,
        commitments: scoreCommitments(c.expect.commitments, x.proposals),
        commitmentsDropped: x.droppedUnsupported,
        forbidden: forbiddenHits([...factual, ...x.proposals.map((p) => p.description), d.content], c.expect.forbidden),
        draft: d.content,
      });
    } catch (error) {
      results.push(blank(c, error instanceof Error ? `${error.name}: ${error.message}` : "error"));
    }
  }

  const source = memoryHistorySource(loaded);
  const denials: string[] = [];
  const audit: AuditSink = { policyDenied: async (tool, reason) => void denials.push(`${tool}: ${reason}`) };
  const ctx = { userId: "eval-user", email: OWNER.email, workspaceId: WORKSPACE, role: "owner" as const, workflow: "askHistory" as const };
  const answers: RetrievalResult[] = [];
  for (const r of retrieval) {
    if (options.stopWhen?.(usage)) {
      answers.push({ question: r.question, expectedCases: r.expectedCases, status: "error", answer: "skipped: evaluation cost limit reached", citedCases: [], hit: false });
      continue;
    }
    log(`ask "${r.question}"`);
    try {
      const h = await askHistory(provider, ctx, r.question, source, audit, new TokenBudget(DEFAULT_BUDGETS.askHistory));
      add(h.metadata.usage);
      const cited = h.status === "answered" ? [...new Set(h.citations.map((x) => x.conversationId))] : [];
      answers.push({
        question: r.question,
        expectedCases: r.expectedCases,
        status: h.status,
        answer: h.status === "answered" ? h.answer : null,
        citedCases: cited,
        hit: r.expectedCases.length === 0 ? h.status === "no_record" : cited.slice(0, 5).some((x) => r.expectedCases.includes(x)),
      });
    } catch (error) {
      answers.push({ question: r.question, expectedCases: r.expectedCases, status: "error", answer: error instanceof Error ? error.message : "error", citedCases: [], hit: false });
    }
  }
  return { cases: results, retrieval: answers, usage, policyDenials: denials };
}

function blank(c: EvalCase, error: string): CaseResult {
  return {
    id: c.id,
    intentOk: false,
    keyPointsFound: 0,
    keyPointsTotal: c.expect.keyPoints.length,
    unsupportedDropped: 0,
    commitments: { expected: c.expect.commitments.length, found: 0, ownerErrors: [], ambiguousDateViolations: [], extras: [] },
    commitmentsDropped: 0,
    forbidden: [],
    draft: "",
    error,
  };
}
