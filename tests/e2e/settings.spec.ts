import { expect, test } from "@playwright/test";

import { acceptInvitation, completeLink } from "./flows";
import { quote, sql, testEmail } from "./support";

test.describe("Settings: time zone and recently deleted", () => {
  test("set a time zone; delete a conversation and restore it within 30 days", async ({ page }) => {
    const email = testEmail("settings");
    await completeLink(page, await acceptInvitation(page, email));
    const ws = `(select workspace_id from public.workspace_members m join auth.users u on u.id = m.user_id where u.email = ${quote(email)})`;

    await page.goto("/app/settings");
    // The section streams in after the page shell; act on it once it is shown.
    const zone = page.getByLabel("Your time zone");
    await expect(zone).toBeVisible();
    await zone.selectOption("Asia/Kolkata");
    await page.getByRole("button", { name: "Save time zone" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
    expect(sql(`select time_zone from public.workspace_settings where workspace_id = ${ws}`)).toBe("Asia/Kolkata");
    await expect(page.getByText("Nothing deleted in the last 30 days.")).toBeVisible();

    await page.goto("/app/studio");
    await page.getByLabel("Subject").fill("Restore me");
    await page.getByLabel("Conversation", { exact: true }).fill("From: Sam <sam@example.com>\n\nSynthetic message for the restore test.");
    await page.getByRole("button", { name: "Import conversation" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Restore me" })).toBeVisible();
    await page.getByRole("button", { name: "Delete conversation" }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Import a conversation" })).toBeVisible();

    await page.goto("/app/settings");
    const deleted = page.getByRole("region", { name: "Recently deleted" });
    await expect(deleted).toContainText("Restore me");
    await expect(deleted).toContainText(/conversation · erased on \w{3} \d{1,2}, \d{4}/);
    await deleted.getByRole("button", { name: "Restore conversation: Restore me" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Restored “Restore me”." })).toBeVisible();
    await expect(page.getByText("Nothing deleted in the last 30 days.")).toBeVisible();

    await page.goto("/app/conversations");
    await expect(page.getByRole("link", { name: /Restore me/ })).toBeVisible();
    expect(sql(`select count(*) from public.audit_events where workspace_id = ${ws} and action = 'conversation.restored'`)).toBe("1");
  });
});
