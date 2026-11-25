"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireRequestContext } from "@/lib/auth/context";
import { AiError } from "@/lib/ai/errors";
import { askAboutHistory, deleteContact, saveContact, updateContact } from "@/lib/services/contacts";
import { StudioError } from "@/lib/services/studio";
import { reportActionError } from "@/lib/observability/log";

export interface FormState {
  error: string | null;
  saved?: boolean;
}

const text = (form: FormData, key: string) => {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
};

const contactInput = z.object({
  name: z.string().min(1, "Enter a name.").max(200),
  email: z.union([z.literal(""), z.email("Enter a valid email or leave it empty.").max(320)]),
  company: z.string().max(200),
  roleTitle: z.string().max(200),
});

export async function createContactAction(_prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireRequestContext();
  const parsed = contactInput.safeParse({ name: text(form, "name"), email: text(form, "email").toLowerCase(), company: text(form, "company"), roleTitle: text(form, "roleTitle") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the fields." };
  let result;
  try {
    result = await saveContact(ctx, parsed.data);
  } catch (error) {
    reportActionError("contacts", error);
    return { error: "Something went wrong. Please try again." };
  }
  if (result.status === "invalid") return { error: "Check the fields and try again." };
  redirect(`/app/contacts/${result.contactId}`);
}

/** "Save as contact" next to a sender in the Studio. */
export async function saveSenderAction(name: string, email: string): Promise<{ error: string | null; contactId?: string }> {
  const ctx = await requireRequestContext();
  if (typeof name !== "string" || typeof email !== "string") return { error: "That sender has no valid email address." };
  const parsed = contactInput.safeParse({ name: name.trim().slice(0, 200) || email, email: email.toLowerCase(), company: "", roleTitle: "" });
  if (!parsed.success || !parsed.data.email) return { error: "That sender has no valid email address." };
  try {
    const result = await saveContact(ctx, parsed.data);
    if (result.status === "invalid") return { error: "That sender couldn't be saved." };
    refresh();
    return { error: null, contactId: result.contactId };
  } catch (error) {
    reportActionError("contacts", error);
    return { error: "Something went wrong. Please try again." };
  }
}

export async function updateContactAction(contactId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const ctx = await requireRequestContext();
  const parsed = z
    .object({ id: z.uuid(), name: z.string().min(1, "Enter a name.").max(200), roleTitle: z.string().max(200), notes: z.string().max(2000) })
    .safeParse({ id: contactId, name: text(form, "name"), roleTitle: text(form, "roleTitle"), notes: text(form, "notes") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the fields." };
  try {
    await updateContact(ctx, parsed.data.id, { name: parsed.data.name, roleTitle: parsed.data.roleTitle || null, notes: parsed.data.notes || null });
  } catch (error) {
    reportActionError("contacts", error);
    return { error: error instanceof StudioError && error.code === "not_found" ? "That contact no longer exists." : "Something went wrong. Please try again." };
  }
  refresh();
  return { error: null, saved: true };
}

export async function deleteContactAction(contactId: string): Promise<FormState> {
  await requireRequestContext();
  if (!z.uuid().safeParse(contactId).success) return { error: "That contact no longer exists." };
  try {
    await deleteContact(contactId);
  } catch (error) {
    reportActionError("contacts", error);
    return { error: "Something went wrong. Please try again." };
  }
  redirect("/app/contacts");
}

export type AskResult =
  | { status: "answered"; answer: string; citations: { conversationId: string; subject: string; position: number; senderName: string | null; sentAt: string | null; quote: string | null }[] }
  | { status: "no_record" }
  | { status: "incomplete" }
  | { status: "error"; message: string };

const AI_MESSAGES: Record<string, string> = {
  not_configured: "AI isn't connected yet, so questions can't be answered.",
  consent_required: "Allow AI processing in Settings to ask questions about your history.",
  daily_limit: "You've reached today's AI limit. It resets at midnight UTC.",
  invalid_output: "The AI couldn't produce a reliable answer. Please try again.",
  refused: "The AI declined this question. Try rephrasing it.",
  timeout: "The AI took too long to respond. Please try again.",
  provider_unavailable: "The AI service is busy right now. Please try again in a minute.",
  provider_rejected: "The AI service rejected the request. Please try again later.",
  budget_exceeded: "That question needs more reading than one request allows. Try a narrower question.",
};

export async function askAction(question: string): Promise<AskResult> {
  const ctx = await requireRequestContext();
  const q = typeof question === "string" ? question.trim() : "";
  if (q.length < 3 || q.length > 500) return { status: "error", message: "Ask a question between 3 and 500 characters." };
  try {
    const r = await askAboutHistory(ctx, q);
    if (r.status !== "answered") return { status: r.status };
    return { status: "answered", answer: r.answer, citations: r.citations.map((c) => ({ conversationId: c.conversationId, subject: c.subject, position: c.position, senderName: c.senderName, sentAt: c.sentAt, quote: c.quote })) };
  } catch (error) {
    reportActionError("contacts", error);
    return { status: "error", message: error instanceof AiError ? (AI_MESSAGES[error.code] ?? "Something went wrong with the AI.") : "Something went wrong. Please try again." };
  }
}
