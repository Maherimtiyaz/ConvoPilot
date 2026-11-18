"use server";

import { redirect } from "next/navigation";

import { requireRequestContext } from "@/lib/auth/context";
import { deleteAccount, exportWorkspaceData } from "@/lib/services/account";

export async function exportDataAction(): Promise<{ error: string | null; json?: string; fileName?: string }> {
  const ctx = await requireRequestContext();
  try {
    const data = await exportWorkspaceData(ctx);
    return { error: null, json: JSON.stringify(data, null, 2), fileName: `convopilot-export-${new Date().toISOString().slice(0, 10)}.json` };
  } catch {
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
  } catch {
    return { error: "Something went wrong. Your account was not deleted. Please try again." };
  }
  redirect("/account-deleted");
}
