"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";

import { requireRequestContext } from "@/lib/auth/context";
import { deleteAccount, exportWorkspaceData, restoreItem, setChatNames, setTimeZone } from "@/lib/services/account";
import { uuidSchema } from "@/lib/validation/studio";
import { reportActionError } from "@/lib/observability/log";

export async function exportDataAction(): Promise<{ error: string | null; json?: string; fileName?: string }> {
  const ctx = await requireRequestContext();
  try {
    const data = await exportWorkspaceData(ctx);
    return { error: null, json: JSON.stringify(data, null, 2), fileName: `convopilot-export-${new Date().toISOString().slice(0, 10)}.json` };
  } catch (error) {
    reportActionError("settings", error);
    return { error: "The export failed. Please try again." };
  }
}

const DELETE_CONFIRMATION = "delete my account";

export async function deleteAccountAction(confirmation: string): Promise<{ error: string | null }> {
  await requireRequestContext();
  if (typeof confirmation !== "string" || confirmation.trim().toLowerCase() !== DELETE_CONFIRMATION) {
    return { error: `Type “${DELETE_CONFIRMATION}” to confirm.` };
  }
  try {
    await deleteAccount();
  } catch (error) {
    reportActionError("settings", error);
    return { error: "Something went wrong. Your account was not deleted. Please try again." };
  }
  redirect("/account-deleted");
}

/** Restores one of the user's own recently deleted conversations or contacts. */
export async function restoreItemAction(kind: "conversation" | "contact", id: string): Promise<{ error: string | null; note?: string }> {
  await requireRequestContext();
  if ((kind !== "conversation" && kind !== "contact") || !uuidSchema.safeParse(id).success) return { error: "That item can't be restored." };
  try {
    const r = await restoreItem(kind, id);
    if (r.status === "duplicate") return { error: "You imported this conversation again after deleting it, so the copy you have now is kept." };
    if (r.status === "not_found") return { error: "That item can no longer be restored." };
    refresh();
    return { error: null, note: r.emailsSkipped > 0 ? "Restored. Its email now belongs to another contact, so it was left there." : undefined };
  } catch (error) {
    reportActionError("settings", error);
    return { error: "Something went wrong. Please try again." };
  }
}

export async function setTimeZoneAction(timeZone: string): Promise<{ error: string | null }> {
  const ctx = await requireRequestContext();
  if (typeof timeZone !== "string") return { error: "Choose a time zone from the list." };
  try {
    if ((await setTimeZone(ctx, timeZone)) === "invalid") return { error: "Choose a time zone from the list." };
    refresh();
    return { error: null };
  } catch (error) {
    reportActionError("settings", error);
    return { error: "Something went wrong. Please try again." };
  }
}

export async function setChatNamesAction(names: unknown): Promise<{ error: string | null }> {
  const ctx = await requireRequestContext();
  const invalid = "Use up to 5 names, each under 100 characters.";
  if (!Array.isArray(names) || names.length > 20 || !names.every((n) => typeof n === "string" && n.length <= 200)) return { error: invalid };
  try {
    if ((await setChatNames(ctx, names)) === "invalid") return { error: invalid };
    refresh();
    return { error: null };
  } catch (error) {
    reportActionError("settings", error);
    return { error: "Something went wrong. Please try again." };
  }
}
