"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { requireRequestContext } from "@/lib/auth/context";
import { AiError } from "@/lib/ai/errors";
import { LIMITS } from "@/lib/conversations/parse";
import {
  analyzeConversation,
  createDraft,
  deleteConversation,
  deleteDraft,
  importConversation,
  StudioError,
  updateAiSettings,
  updateDraft,
} from "@/lib/services/studio";
import { draftOptionsSchema, subjectSchema, uuidSchema, writingStyleSchema } from "@/lib/validation/studio";

export interface ActionState {
  error: string | null;
  saved?: boolean;
}

const PARSE_MESSAGES: Record<string, string> = {
  empty: "There's no text to import. Paste a conversation or choose a file.",
  too_long: `That's too long to import (limit: ${LIMITS.maxChars.toLocaleString("en-US")} characters).`,
  too_many_messages: `That thread has more than ${LIMITS.maxMessages} messages. Import a shorter part of it.`,
  unsupported_file: "Choose a .txt, .md or .eml file (WhatsApp chat exports are .txt).",
  file_too_large: "That file is too large (limit: 750 KB).",
  invalid_text: "That file contains unreadable (binary) content. Export the email as text or .eml and try again.",
};

const AI_MESSAGES: Record<string, string> = {
  not_configured: "AI isn't connected yet. Your conversation is saved; try again once AI is set up.",
  consent_required: "Allow AI processing first (below) to analyse or draft.",
  daily_limit: "You've reached today's AI limit. It resets at midnight UTC.",
  budget_exceeded: "This conversation is too long to analyse in one go. Try importing a shorter part.",
  invalid_output: "The AI couldn't produce a reliable result. Please try again.",
  refused: "The AI declined this request. Try rephrasing your instructions.",
  timeout: "The AI took too long to respond. Please try again.",
  provider_unavailable: "The AI service is busy right now. Please try again in a minute.",
  provider_rejected: "The AI service rejected the request. Please try again later.",
};

function message(error: unknown): string {
  if (error instanceof AiError) return AI_MESSAGES[error.code] ?? "Something went wrong with the AI. Please try again.";
  if (error instanceof StudioError && error.code === "not_found") return "That conversation no longer exists.";
  return "Something went wrong. Please try again.";
}

const text = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v : "";
};

export async function importAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireRequestContext();
  const subject = subjectSchema.safeParse(text(form, "subject"));
  if (!subject.success) return { error: "Keep the subject under 300 characters." };
  const file = form.get("file");
  let result;
  try {
    if (file instanceof File && file.size > 0) {
      if (file.size > LIMITS.maxFileBytes) return { error: PARSE_MESSAGES.file_too_large };
      result = await importConversation(ctx, { kind: "file", name: file.name, bytes: new Uint8Array(await file.arrayBuffer()), subject: subject.data });
    } else {
      result = await importConversation(ctx, { kind: "paste", text: text(form, "text"), subject: subject.data });
    }
  } catch (error) {
    return { error: message(error) };
  }
  if (result.status === "parse_error") return { error: PARSE_MESSAGES[result.error] };
  if (result.status === "invalid") return { error: "That conversation couldn't be imported." };
  const older = result.omittedOlder > 0 ? `&older=${result.omittedOlder}` : "";
  redirect(`/app/studio?c=${result.conversationId}${result.status === "duplicate" ? "&dup=1" : ""}${older}`);
}

export async function analyzeAction(conversationId: string): Promise<ActionState> {
  const ctx = await requireRequestContext();
  if (!uuidSchema.safeParse(conversationId).success) return { error: "That conversation no longer exists." };
  try {
    await analyzeConversation(ctx, conversationId);
  } catch (error) {
    return { error: message(error) };
  }
  refresh();
  return { error: null };
}

export async function draftAction(conversationId: string, options: unknown): Promise<ActionState> {
  const ctx = await requireRequestContext();
  const parsed = draftOptionsSchema.safeParse(options);
  if (!uuidSchema.safeParse(conversationId).success || !parsed.success) return { error: "Check the draft options and try again." };
  try {
    await createDraft(ctx, conversationId, parsed.data);
  } catch (error) {
    return { error: message(error) };
  }
  refresh();
  return { error: null };
}

export async function saveDraftAction(draftId: string, content: string): Promise<ActionState> {
  const ctx = await requireRequestContext();
  if (!uuidSchema.safeParse(draftId).success || typeof content !== "string" || content.trim().length === 0 || content.length > 20000) {
    return { error: "A draft can't be empty or longer than 20,000 characters." };
  }
  try {
    await updateDraft(ctx, draftId, content);
  } catch (error) {
    return { error: message(error) };
  }
  refresh();
  return { error: null };
}

export async function deleteDraftAction(draftId: string): Promise<ActionState> {
  await requireRequestContext();
  if (!uuidSchema.safeParse(draftId).success) return { error: "That draft no longer exists." };
  try {
    await deleteDraft(draftId);
  } catch (error) {
    return { error: message(error) };
  }
  refresh();
  return { error: null };
}

export async function deleteConversationAction(conversationId: string): Promise<ActionState> {
  await requireRequestContext();
  if (!uuidSchema.safeParse(conversationId).success) return { error: "That conversation no longer exists." };
  try {
    await deleteConversation(conversationId);
  } catch (error) {
    return { error: message(error) };
  }
  redirect("/app/studio");
}

export async function setAiConsentAction(optIn: boolean): Promise<ActionState> {
  const ctx = await requireRequestContext();
  try {
    await updateAiSettings(ctx, { optIn: optIn === true });
  } catch (error) {
    return { error: message(error) };
  }
  refresh();
  return { error: null };
}

export async function saveStyleAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const ctx = await requireRequestContext();
  const parsed = writingStyleSchema.safeParse({
    tone: text(form, "tone"),
    greeting: text(form, "greeting"),
    signOff: text(form, "signOff"),
    avoid: text(form, "avoid"),
    notes: text(form, "notes"),
    sample: text(form, "sample"),
  });
  if (!parsed.success) return { error: "One of the fields is too long." };
  const style = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v)) as typeof parsed.data;
  try {
    await updateAiSettings(ctx, { style });
  } catch (error) {
    return { error: message(error) };
  }
  refresh();
  return { error: null, saved: true };
}
