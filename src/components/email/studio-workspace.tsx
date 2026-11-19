"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import type { EmailAnalysis } from "@/lib/schemas/communication";

type Stage = "input" | "analyzed" | "drafted";

interface ImportResult {
  conversationId: string;
  messageCount: number;
  contactId: string | null;
  sender: { name: string | null; email: string | null };
}

const TONES = ["direct", "warm", "formal"] as const;
const LENGTHS = ["short", "medium", "long"] as const;

const URGENCY_TONE: Record<string, "neutral" | "info" | "warning" | "danger"> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  urgent: "danger",
};

export function StudioWorkspace() {
  const [stage, setStage] = useState<Stage>("input");
  const [busy, setBusy] = useState<null | "import" | "analyze" | "draft" | "save">(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [threadText, setThreadText] = useState("");
  const [subject, setSubject] = useState("");
  const [intendedOutcome, setIntendedOutcome] = useState("");
  const [tone, setTone] = useState<(typeof TONES)[number]>("direct");
  const [length, setLength] = useState<(typeof LENGTHS)[number]>("medium");
  const [saveSender, setSaveSender] = useState(false);
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");

  const [imported, setImported] = useState<ImportResult | null>(null);
  const [analysis, setAnalysis] = useState<EmailAnalysis | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftContent, setDraftContent] = useState("");

  async function handleImportAndAnalyze() {
    setError(null);
    setBusy("import");
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject || undefined,
          threadText,
          saveSender,
          senderName: senderName || undefined,
          senderEmail: senderEmail || undefined,
        }),
      });
      const body = (await res.json()) as ImportResult & { error?: { message: string } };
      if (!res.ok) throw new Error(body.error?.message ?? "Import failed");
      setImported(body);

      setBusy("analyze");
      const analyzeRes = await fetch(`/api/conversations/${body.conversationId}/analyze`, { method: "POST" });
      const analyzeBody = (await analyzeRes.json()) as { analysis?: EmailAnalysis; error?: { message: string } };
      if (!analyzeRes.ok) throw new Error(analyzeBody.error?.message ?? "Analysis failed");
      setAnalysis(analyzeBody.analysis ?? null);
      setStage("analyzed");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  async function handleGenerateDraft() {
    if (!imported) return;
    setError(null);
    setBusy("draft");
    try {
      const res = await fetch(`/api/conversations/${imported.conversationId}/drafts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: imported.conversationId, intendedOutcome: intendedOutcome || undefined, tone, length }),
      });
      const body = (await res.json()) as { draftId?: string; content?: string; error?: { message: string } };
      if (!res.ok || !body.draftId || !body.content) throw new Error(body.error?.message ?? "Draft generation failed");
      setDraftId(body.draftId);
      setDraftContent(body.content);
      setStage("drafted");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  async function handleSaveDraft() {
    if (!draftId) return;
    setError(null);
    setBusy("save");
    try {
      const res = await fetch(`/api/drafts/${draftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draftContent, status: "draft" }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: { message: string } };
        throw new Error(body.error?.message ?? "Saving failed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(draftContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function reset() {
    setStage("input");
    setImported(null);
    setAnalysis(null);
    setDraftId(null);
    setDraftContent("");
    setThreadText("");
    setSubject("");
    setError(null);
  }

  return (
    <div className="space-y-6">
      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {stage === "input" ? (
        <Card>
          <CardHeader>
            <CardTitle>Paste an email or thread</CardTitle>
            <CardDescription>
              Include the full thread if you have it — more context produces a better reply.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="subject">Subject (optional)</Label>
              <Input id="subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Re: collaboration follow-up" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="thread">Email thread</Label>
              <textarea
                id="thread"
                value={threadText}
                onChange={(e) => setThreadText(e.target.value)}
                rows={12}
                className="w-full rounded-lg border border-zinc-300 bg-white p-3 font-mono text-sm focus:border-zinc-500 focus:outline-none"
                placeholder={"From: sender@example.com\nSent: 12 March\nSubject: Quick question\n\nHi …"}
              />
            </div>

            <fieldset className="rounded-lg border border-zinc-200 p-4">
              <legend className="px-1 text-sm font-medium text-zinc-700">Save sender as contact</legend>
              <label className="flex items-center gap-2 text-sm text-zinc-600">
                <input type="checkbox" checked={saveSender} onChange={(e) => setSaveSender(e.target.checked)} />
                Save the sender to Contacts
              </label>
              {saveSender ? (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Name (auto-detected if blank)" />
                  <Input value={senderEmail} onChange={(e) => setSenderEmail(e.target.value)} placeholder="Email (auto-detected if blank)" />
                </div>
              ) : null}
            </fieldset>

            <div className="flex items-center gap-3">
              <Button onClick={handleImportAndAnalyze} disabled={busy !== null || threadText.trim().length < 20}>
                {busy === "import" ? "Importing…" : busy === "analyze" ? "Analyzing…" : "Import & analyze"}
              </Button>
              {busy ? <span className="text-sm text-zinc-500">Working — this calls your AI provider.</span> : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {imported ? (
        <Card>
          <CardHeader>
            <CardTitle>Imported conversation</CardTitle>
            <CardDescription>
              {imported.messageCount} message{imported.messageCount === 1 ? "" : "s"} stored
              {imported.sender.email ? ` from ${imported.sender.name ?? imported.sender.email}` : ""}
              {imported.contactId ? " · contact saved" : ""}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {analysis ? (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CardTitle>Analysis</CardTitle>
              <Badge tone={URGENCY_TONE[analysis.urgency] ?? "neutral"}>{analysis.urgency}</Badge>
              <Badge>{analysis.intent.replace("_", " ")}</Badge>
              <Badge tone={analysis.confidence >= 0.7 ? "success" : "warning"}>
                confidence {Math.round(analysis.confidence * 100)}%
              </Badge>
            </div>
            <CardDescription>{analysis.summary}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-zinc-700">
            <div>
              <p className="font-medium text-zinc-900">Main points</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {analysis.mainPoints.map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>
            </div>
            <p>
              <span className="font-medium text-zinc-900">Sender ask: </span>
              {analysis.senderAsk}
            </p>
            <p>
              <span className="font-medium text-zinc-900">Expected response: </span>
              {analysis.expectedResponse}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {stage === "analyzed" || stage === "drafted" ? (
        <Card>
          <CardHeader>
            <CardTitle>Generate a reply</CardTitle>
            <CardDescription>The draft is generated from the stored thread and your contact context.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="outcome">Intended outcome (optional)</Label>
              <Input
                id="outcome"
                value={intendedOutcome}
                onChange={(e) => setIntendedOutcome(e.target.value)}
                placeholder="e.g. agree to a 20-minute call next week"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="tone">Tone</Label>
                <select
                  id="tone"
                  value={tone}
                  onChange={(e) => setTone(e.target.value as (typeof TONES)[number])}
                  className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm focus:border-zinc-500 focus:outline-none"
                >
                  {TONES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="length">Length</Label>
                <select
                  id="length"
                  value={length}
                  onChange={(e) => setLength(e.target.value as (typeof LENGTHS)[number])}
                  className="h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm focus:border-zinc-500 focus:outline-none"
                >
                  {LENGTHS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={handleGenerateDraft} disabled={busy !== null}>
                {busy === "draft" ? "Generating…" : draftId ? "Regenerate draft" : "Generate draft"}
              </Button>
              <Button variant="ghost" onClick={reset} disabled={busy !== null}>
                Start over
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {draftId ? (
        <Card>
          <CardHeader>
            <CardTitle>Draft reply</CardTitle>
            <CardDescription>Edit freely, then save. Nothing is ever sent automatically.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <textarea
              value={draftContent}
              onChange={(e) => setDraftContent(e.target.value)}
              rows={10}
              className="w-full rounded-lg border border-zinc-300 bg-white p-3 text-sm focus:border-zinc-500 focus:outline-none"
            />
            <div className="flex items-center gap-3">
              <Button onClick={handleSaveDraft} disabled={busy !== null || !draftContent.trim()}>
                {busy === "save" ? "Saving…" : "Save draft"}
              </Button>
              <Button variant="outline" onClick={handleCopy}>
                {copied ? "Copied ✓" : "Copy to clipboard"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
