"use client";

import { useState, useTransition } from "react";

import { Thinking } from "@/components/ui";
import type { StoredPoint } from "@/lib/ai/workflows/analyze-thread";
import type { CommitmentView } from "@/lib/services/commitments";
import type { ConversationDetail } from "@/lib/services/studio";

import { CommitmentsPanel } from "./commitments-panel";
import { SenderContact } from "./sender-contact";
import { analyzeAction, deleteConversationAction, deleteDraftAction, draftAction, saveDraftAction, setAiConsentAction } from "./actions";

interface AiState {
  configured: boolean;
  optIn: boolean;
  spentTodayUsd: number;
  capUsd: number;
}

const secondary = "inline-flex h-10 items-center justify-center gap-2 rounded-full border border-ink-200 bg-white/80 px-4 text-sm font-medium text-ink transition duration-200 ease-brand hover:-translate-y-px hover:bg-white active:scale-[0.97] disabled:opacity-50";
const primary = "inline-flex h-10 items-center justify-center gap-2 rounded-full bg-ink px-5 text-sm font-semibold text-white shadow-[0_10px_22px_-12px_rgba(23,21,31,0.6)] transition duration-200 ease-brand hover:-translate-y-px hover:bg-ink-700 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50";

function Alert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-xl border border-error/30 bg-error-50 px-3 py-2 text-sm text-error">
      {message}
    </p>
  );
}

function Citations({ point, onFocus }: { point: StoredPoint; onFocus: (position: number) => void }) {
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-baseline">
      {point.citations.map((c, i) => (
        <button
          key={`${c.messageId}-${i}`}
          type="button"
          onClick={() => onFocus(c.position)}
          title={c.quote ? `“${c.quote}”` : `Message ${c.position}`}
          aria-label={`Source: message ${c.position}${c.quote ? `, quote: ${c.quote}` : ""}`}
          className="rounded-md bg-ink-100 px-1.5 font-mono text-[11px] text-route hover:bg-route-50"
        >
          [{c.position}]
        </button>
      ))}
    </span>
  );
}

export function ConversationView({ detail, ai, createdLabel, contacts, commitments }: { detail: ConversationDetail; ai: AiState; createdLabel: string; contacts: Record<string, string>; commitments: CommitmentView[] }) {
  const { conversation, messages, analysis, drafts } = detail;
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"analyze" | "draft" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tone, setTone] = useState<"warm" | "neutral" | "formal">("warm");
  const [length, setLength] = useState<"short" | "medium" | "long">("short");
  const [instructions, setInstructions] = useState("");

  const run = (kind: "analyze" | "draft" | null, fn: () => Promise<{ error: string | null }>) =>
    startTransition(async () => {
      setBusy(kind);
      setError(null);
      const r = await fn();
      if (r.error) setError(r.error);
      setBusy(null);
    });

  const focusMessage = (position: number) => {
    setFocused(position);
    document.getElementById(`message-${position}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const aiReady = ai.configured && ai.optIn;
  const a = analysis?.data;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-3xl font-medium tracking-tight">{conversation.subject}</h2>
          <p className="mt-1 font-mono text-xs text-ink-500">
            {conversation.message_count} {conversation.message_count === 1 ? "message" : "messages"} · imported {createdLabel} · {conversation.source_type === "file" ? "from a file" : "pasted"}
          </p>
        </div>
        {confirmDelete ? (
          <span className="flex items-center gap-2 text-sm">
            <span>Delete this conversation, its analysis and drafts?</span>
            <button type="button" disabled={pending} onClick={() => run(null, () => deleteConversationAction(conversation.id))} className="h-9 rounded-xl bg-error px-3 font-semibold text-white">
              Delete
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="h-9 rounded-xl border border-ink-300 px-3">
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} className="text-sm font-medium text-ink-700 hover:text-error">
            Delete conversation
          </button>
        )}
      </header>

      <Alert message={error} />

      {!ai.configured && (
        <p role="status" className="rounded-[10px] border border-warning/30 bg-warning-50 px-4 py-3 text-sm text-warning">
          AI isn&apos;t connected yet, so analysis and drafting are unavailable. Your conversation is saved.
        </p>
      )}
      {ai.configured && !ai.optIn && (
        <section aria-labelledby="consent-heading" className="cp-glass rounded-3xl p-5">
          <h3 id="consent-heading" className="font-semibold">
            Allow AI processing
          </h3>
          <p className="mt-1 text-[15px] leading-relaxed text-ink-700">
            To analyse a conversation or draft a reply, ConvoPilot sends the text of that conversation to Anthropic (the maker of Claude) for processing. It is sent only when you press Analyse or Draft, and nothing is ever sent to the people in the conversation. You can turn this off any time in Settings.
          </p>
          <button type="button" disabled={pending} onClick={() => run(null, () => setAiConsentAction(true))} className={`${primary} mt-4`}>
            Allow AI processing
          </button>
        </section>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-labelledby="messages-heading" className="min-w-0 space-y-3">
          <h3 id="messages-heading" className="font-mono text-xs uppercase tracking-wider text-ink-500">
            Messages
          </h3>
          <ol className="space-y-3">
            {messages.map((m) => (
              <li
                key={m.id}
                id={`message-${m.position}`}
                className={`scroll-mt-24 rounded-[10px] border bg-white p-4 transition-colors ${focused === m.position ? "border-marker bg-marker-100/40" : "border-ink-200"}`}
              >
                <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span>
                    <span className="mr-2 font-mono text-xs text-ink-500">[{m.position}]</span>
                    <span className="font-semibold">{m.senderName ?? m.senderEmail ?? "Sender not shown in the pasted text"}</span>
                    {m.senderName && m.senderEmail && <span className="text-ink-500"> · {m.senderEmail}</span>}
                    {m.direction === "outbound" && <span className="ml-2 rounded-full bg-ink-100 px-2 py-0.5 font-mono text-[11px] text-ink-700">you</span>}
                    {m.direction !== "outbound" && m.senderEmail && <SenderContact name={m.senderName} email={m.senderEmail} contactId={contacts[m.senderEmail.toLowerCase()]} />}
                  </span>
                  {m.sentAt && <span className="font-mono text-xs text-ink-500">{m.sentAt.slice(0, 16).replace("T", " ")} UTC</span>}
                </p>
                {/* Imported content is rendered as plain text only. */}
                <p className="mt-2 whitespace-pre-wrap break-words text-[15px] leading-relaxed text-ink-700">{m.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <div className="min-w-0 space-y-6">
          <section aria-labelledby="analysis-heading" className="cp-glass rounded-3xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 id="analysis-heading" className="font-display text-2xl font-medium">
                Analysis
              </h3>
              <button type="button" disabled={!aiReady || pending} onClick={() => run("analyze", () => analyzeAction(conversation.id))} className={a ? secondary : primary}>
                {busy === "analyze" ? <Thinking label="Analysing…" /> : a ? "Analyse again" : "Analyse"}
              </button>
            </div>
            {!a ? (
              <p className="mt-3 text-[15px] text-ink-700">
                {busy === "analyze" ? "Reading the thread…" : "See what they want, the main points and what they expect from you, each linked to the message it came from."}
              </p>
            ) : (
              <div className="mt-4 space-y-4 text-[15px] leading-relaxed">
                <div>
                  <p className="font-mono text-xs uppercase tracking-wider text-ink-500">What they want</p>
                  {a.intent ? (
                    <p className="mt-1">
                      {a.intent.text}
                      <Citations point={a.intent} onFocus={focusMessage} />
                    </p>
                  ) : (
                    <p className="mt-1 text-ink-500">No clear request found in the messages.</p>
                  )}
                </div>
                <div>
                  <p className="font-mono text-xs uppercase tracking-wider text-ink-500">Main points</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {a.mainPoints.map((p, i) => (
                      <li key={i}>
                        {p.text}
                        <Citations point={p} onFocus={focusMessage} />
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-mono text-xs uppercase tracking-wider text-ink-500">What they expect from you</p>
                  {a.expectedResponse ? (
                    <p className="mt-1 rounded-md bg-marker-100 px-2 py-1">
                      {a.expectedResponse.text}
                      <Citations point={a.expectedResponse} onFocus={focusMessage} />
                    </p>
                  ) : (
                    <p className="mt-1 text-ink-500">No clear expectation found.</p>
                  )}
                </div>
                {a.risks.length > 0 && (
                  <div>
                    <p className="font-mono text-xs uppercase tracking-wider text-ink-500">Watch out for</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5">
                      {a.risks.map((p, i) => (
                        <li key={i}>
                          {p.text}
                          <Citations point={p} onFocus={focusMessage} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="flex flex-wrap gap-x-4 gap-y-1 border-t border-ink-200 pt-3 font-mono text-xs text-ink-500">
                  <span>Urgency: {a.urgency}{a.urgencyReason ? ` · ${a.urgencyReason}` : ""}</span>
                  <span>Confidence: {a.confidence}</span>
                  {a.droppedUnsupported > 0 && <span>{a.droppedUnsupported} unsupported {a.droppedUnsupported === 1 ? "statement" : "statements"} removed</span>}
                </p>
              </div>
            )}
          </section>

          <CommitmentsPanel conversationId={conversation.id} commitments={commitments} aiReady={aiReady} onFocus={focusMessage} />

          <section aria-labelledby="draft-heading" className="cp-glass rounded-3xl p-5">
            <h3 id="draft-heading" className="font-display text-2xl font-medium">
              Draft a reply
            </h3>
            <p className="mt-1 text-sm text-ink-700">Written in your voice, using your style from Settings. You review and send it yourself.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-sm font-medium">
                <span>Tone</span>
                <select value={tone} onChange={(e) => setTone(e.target.value as typeof tone)} className="block h-10 w-full rounded-xl border border-ink-300 bg-white px-2">
                  <option value="warm">Warm</option>
                  <option value="neutral">Neutral</option>
                  <option value="formal">Formal</option>
                </select>
              </label>
              <label className="space-y-1 text-sm font-medium">
                <span>Length</span>
                <select value={length} onChange={(e) => setLength(e.target.value as typeof length)} className="block h-10 w-full rounded-xl border border-ink-300 bg-white px-2">
                  <option value="short">Short</option>
                  <option value="medium">Medium</option>
                  <option value="long">Long</option>
                </select>
              </label>
            </div>
            <label className="mt-3 block space-y-1 text-sm font-medium">
              <span>
                What should the reply say? <span className="font-normal text-ink-500">(optional)</span>
              </span>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                maxLength={500}
                rows={2}
                placeholder="e.g. Yes to Friday; ask whether April also works"
                className="block w-full rounded-xl border border-ink-300 px-3 py-2 font-normal"
              />
            </label>
            <button
              type="button"
              disabled={!aiReady || pending}
              onClick={() => run("draft", () => draftAction(conversation.id, { tone, length, instructions: instructions.trim() || undefined }))}
              className={`${primary} mt-4`}
            >
              {busy === "draft" ? <Thinking label="Drafting…" /> : "Draft reply"}
            </button>

            {drafts.length > 0 && (
              <div className="mt-6 space-y-4">
                {drafts.map((d, i) => (
                  <DraftEditor key={d.id} draft={d} latest={i === 0} disabled={pending} onRun={run} />
                ))}
              </div>
            )}
          </section>
          {ai.configured && (
            <p className="font-mono text-xs text-ink-500">
              AI spend today: ${ai.spentTodayUsd.toFixed(2)} of ${ai.capUsd.toFixed(2)}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function DraftEditor({
  draft,
  latest,
  disabled,
  onRun,
}: {
  draft: ConversationDetail["drafts"][number];
  latest: boolean;
  disabled: boolean;
  onRun: (kind: null, fn: () => Promise<{ error: string | null }>) => void;
}) {
  const [content, setContent] = useState(draft.content);
  const [open, setOpen] = useState(latest);
  const [copied, setCopied] = useState(false);
  const dirty = content !== draft.content;
  const id = `draft-${draft.id}`;

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="block w-full rounded-xl border border-ink-200 px-3 py-2 text-left text-sm text-ink-700 hover:bg-ink-100">
        Earlier draft · {draft.tone}, {draft.length} · {draft.created_at.slice(0, 16).replace("T", " ")} UTC
      </button>
    );
  }
  return (
    <div className="space-y-2 rounded-[10px] border border-ink-200 p-4">
      <label htmlFor={id} className="flex flex-wrap justify-between gap-2 font-mono text-xs uppercase tracking-wider text-ink-500">
        <span>
          {latest ? "Latest draft" : "Earlier draft"} · {draft.tone} · {draft.length}
          {draft.edited_by_user ? " · edited" : ""}
        </span>
        <span>Not sent</span>
      </label>
      <textarea id={id} value={content} onChange={(e) => setContent(e.target.value)} rows={8} maxLength={20000} className="block w-full rounded-xl border border-ink-300 px-3 py-2 text-[15px] leading-relaxed" />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            navigator.clipboard?.writeText(content).then(
              () => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              },
              () => setCopied(false),
            )
          }
          className={primary}
        >
          {copied ? "Copied" : "Copy reply"}
        </button>
        <button type="button" disabled={!dirty || disabled} onClick={() => onRun(null, () => saveDraftAction(draft.id, content))} className={secondary}>
          {dirty ? "Save changes" : "Saved"}
        </button>
        <button type="button" disabled={disabled} onClick={() => onRun(null, () => deleteDraftAction(draft.id))} className="h-10 px-2 text-sm font-medium text-ink-700 hover:text-error">
          Delete draft
        </button>
      </div>
    </div>
  );
}
