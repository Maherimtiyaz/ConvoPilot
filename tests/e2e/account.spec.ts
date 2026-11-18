import { readFile } from "node:fs/promises";

import { expect, test } from "@playwright/test";

import { acceptInvitation, completeLink } from "./flows";
import { quote, sql, testEmail } from "./support";

test.describe("Your data", () => {
  test("download a full export, then delete the account and lose access everywhere", async ({ page }) => {
    const email = testEmail("account");
    await completeLink(page, await acceptInvitation(page, email));
    const ws = `(select workspace_id from public.workspace_members m join auth.users u on u.id = m.user_id where u.email = ${quote(email)})`;

    await page.goto("/app/studio");
    await page.getByLabel("Subject").fill("Export check");
    await page.getByLabel("Conversation", { exact: true }).fill("From: Sam <sam@example.com>\n\nSynthetic message for the export test.");
    await page.getByRole("button", { name: "Import conversation" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Export check" })).toBeVisible();

    await page.goto("/app/settings");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download my data" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^convopilot-export-\d{4}-\d{2}-\d{2}\.json$/);
    const data = JSON.parse(await readFile((await file.path())!, "utf8"));
    expect(data.format).toBe("convopilot-export@1");
    expect(data.account_email).toBe(email);
    expect(data.conversations.map((c: { subject: string }) => c.subject)).toEqual(["Export check"]);
    expect(data.messages[0].body_text).toContain("Synthetic message for the export test.");
    expect(sql(`select count(*) from public.audit_events where workspace_id = ${ws} and action = 'export.requested'`)).toBe("1");

    // Deleting needs a typed confirmation.
    await page.getByRole("button", { name: "Delete my account…" }).click();
    const confirm = page.getByRole("button", { name: "Delete my account", exact: true });
    await expect(confirm).toBeDisabled();
    await page.getByLabel("Type “delete my account” to confirm").fill("delete my account");
    await confirm.click();
    await expect(page).toHaveURL(/\/account-deleted$/);
    await expect(page.getByRole("heading", { name: "Your account is being deleted" })).toBeVisible();

    // Signed out, and the workspace is gone at once.
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login/);
    expect(sql(`select (deleted_at is not null)::text from public.workspaces where id = ${ws}`)).toBe("true");
    expect(sql(`select count(*) from auth.sessions s join auth.users u on u.id = s.user_id where u.email = ${quote(email)}`)).toBe("0");
  });
});
