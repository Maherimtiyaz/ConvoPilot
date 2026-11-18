"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { requireRequestContext } from "@/lib/auth/context";
import { AiError } from "@/lib/ai/errors";
import { createTask, extractConversationCommitments, setTaskStatus, type ExtractSummary } from "@/lib/services/commitments";
import { approveTask, decideProposal, type DecisionStatus } from "@/lib/services/proposals/decide";
import { StudioError } from "@/lib/services/studio";
import { uuidSchema } from "@/lib/validation/studio";

export interface Result {
  error: string | null;
}

const AI_MESSAGES: Record<string, string> = {
  not_configured: "AI isn't connected yet. Try again once AI is set up.",
  consent_required: "Allow AI processing first to find commitments.",
  daily_limit: "You've reached today's AI limit. It resets at midnight UTC.",
  budget_exceeded: "This conversation is too long to check in one go. Try importing a shorter part.",
  invalid_output: "The AI couldn't produce a reliable result. Please try again.",
  refused: "The AI declined this request.",
  timeout: "The AI took too long to respond. Please try again.",
  provider_unavailable: "The AI service is busy right now. Please try again in a minute.",
  provider_rejected: "The AI service rejected the request. Please try again later.",
};

const DECISION_MESSAGES: Record<Exclude<DecisionStatus, "ok">, string> = {
  not_found: "That item no longer exists.",
  invalid: "That action isn't possible.",
  invalid_transition: "That was already decided. Refresh to see its current state.",
  unsupported: "Its source message was deleted, so it can't be confirmed.",
  commitment_not_confirmed: "Confirm the commitment first.",
};

function failure(error: unknown): Result {
  if (error instanceof AiError) return { error: AI_MESSAGES[error.code] ?? "Something went wrong with the AI. Please try again." };
  if (error instanceof StudioError && error.code === "not_found") return { error: "That conversation no longer exists." };
  return { error: "Something went wrong. Please try again." };
}

const decided = (status: DecisionStatus): Result => {
  refresh();
  return { error: status === "ok" ? null : DECISION_MESSAGES[status] };
};

export async function extractCommitmentsAction(conversationId: string): Promise<Result & { summary?: ExtractSummary }> {
  const ctx = await requireRequestContext();
  if (!uuidSchema.safeParse(conversationId).success) return { error: "That conversation no longer exists." };
  try {
    const summary = await extractConversationCommitments(ctx, conversationId);
    refresh();
    return { error: null, summary };
  } catch (error) {
    return failure(error);
  }
}

/** The user's decision on a proposed commitment. Never called by AI code. */
export async function decideCommitmentAction(commitmentId: string, decision: "confirm" | "reject"): Promise<Result> {
  const ctx = await requireRequestContext();
  if (!uuidSchema.safeParse(commitmentId).success || !["confirm", "reject"].includes(decision)) return { error: "That action isn't possible." };
  try {
    return decided(await decideProposal(ctx, "commitment", commitmentId, decision));
  } catch (error) {
    return failure(error);
  }
}

/** The user approves a proposed task (optionally confirming its commitment in the same step). */
export async function approveTaskAction(taskId: string, confirmCommitment: boolean): Promise<Result> {
  const ctx = await requireRequestContext();
  if (!uuidSchema.safeParse(taskId).success) return { error: "That action isn't possible." };
  try {
    return decided(await approveTask(ctx, taskId, confirmCommitment === true));
  } catch (error) {
    return failure(error);
  }
}

export async function rejectTaskAction(taskId: string): Promise<Result> {
  const ctx = await requireRequestContext();
  if (!uuidSchema.safeParse(taskId).success) return { error: "That action isn't possible." };
  try {
    return decided(await decideProposal(ctx, "task", taskId, "reject"));
  } catch (error) {
    return failure(error);
  }
}

export async function setTaskStatusAction(taskId: string, status: "open" | "done" | "dismissed"): Promise<Result> {
  const ctx = await requireRequestContext();
  if (!uuidSchema.safeParse(taskId).success || !["open", "done", "dismissed"].includes(status)) return { error: "That action isn't possible." };
  try {
    const r = await setTaskStatus(ctx, taskId, status);
    refresh();
    return { error: r === "ok" ? null : r === "not_found" ? "That task no longer exists." : "That task changed. Refresh to see its current state." };
  } catch (error) {
    return failure(error);
  }
}

const newTask = z.object({
  title: z.string().trim().min(1, "Enter a task.").max(200, "Keep the task under 200 characters."),
  dueDate: z.union([z.literal(""), z.iso.date("Enter a valid date.")]),
  priority: z.enum(["low", "normal", "high"]),
});

export async function createTaskAction(_prev: Result & { saved?: number }, form: FormData): Promise<Result & { saved?: number }> {
  const ctx = await requireRequestContext();
  const v = (k: string) => (typeof form.get(k) === "string" ? (form.get(k) as string) : "");
  const parsed = newTask.safeParse({ title: v("title"), dueDate: v("dueDate"), priority: v("priority") || "normal" });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the fields." };
  try {
    const r = await createTask(ctx, { title: parsed.data.title, dueDate: parsed.data.dueDate || null, priority: parsed.data.priority });
    if (r !== "created") return { error: "That task couldn't be saved." };
    refresh();
    return { error: null, saved: Date.now() };
  } catch (error) {
    return failure(error);
  }
}
