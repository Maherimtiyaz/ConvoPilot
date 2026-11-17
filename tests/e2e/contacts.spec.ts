import { expect, test } from "@playwright/test";

import { acceptInvitation, completeLink } from "./flows";
import { quote, sql, testEmail } from "./support";

// Synthetic data only.
const THREAD = `Sounds good, will do.

On Thu, 12 Mar 2026 at 09:14, Priya Shah <priya@example.com> wrote:
> Thanks for the call today. Could you send the revised deck by Friday?
> We'd also like to know if the pilot can start in March.`;

test.describe("Contacts, Conversations and history", () => {
  test("save a sender, edit, search, ask with citations, no record, isolation, delete", async ({ page, browser }) => {
    const email = testEmail("contacts");
    await completeLink(page, await acceptInvitation(page, email));

    await page.goto("/app/contacts");
    await expect(page.getByRole("heading", { name: "No contacts yet" })).toBeVisible();

    // Import a thread and save its sender from the Studio.
    await page.goto("/app/studio");
    await page.getByLabel("Subject").fill("Deck review");
    await page.getByLabel("Conversation", { exact: true }).fill(THREAD);
    await page.getByRole("button", { name: "Import conversation" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Deck review" })).toBeVisible();
    await page.locator("#message-1").getByRole("button", { name: "Save as contact" }).click();
    await page.locator("#message-1").getByRole("link", { name: "View contact" }).click();

    await expect(page.getByRole("heading", { level: 2, name: "Priya Shah", exact: true })).toBeVisible();
    await expect(page.getByText("priya@example.com", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /Deck review/ })).toBeVisible();
    const contactUrl = page.url();

    await page.getByLabel("Role").fill("Head of Partnerships");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();

    await page.goto("/app/contacts");
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Contacts" })).toHaveAttribute("aria-current", "page");
    const row = page.getByRole("link", { name: /Priya Shah/ });
    await expect(row).toContainText("Head of Partnerships");
    await expect(row).toContainText("1 conversation");

    // A contact added by hand is linked when their email appears in a later import.
    await page.getByLabel("Name").fill("Mateo Example");
    await page.getByLabel("Email").fill("mateo@example.com");
    await page.getByRole("button", { name: "Save contact" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Mateo Example", exact: true })).toBeVisible();
    await expect(page.getByText(/No conversations with Mateo Example yet/)).toBeVisible();

    // Keyword search over messages.
    await page.goto("/app/conversations?q=deck%20Friday");
    await expect(page.getByRole("link", { name: "Deck review · message [1]" })).toBeVisible();
    await page.goto("/app/conversations?q=zeppelin");
    await expect(page.getByText("No messages match “zeppelin”.")).toBeVisible();

    // "What did I discuss…?" needs AI consent; the answer cites the stored message.
    await page.goto("/app/studio");
    await page.getByRole("link", { name: /Deck review/ }).click();
    await page.getByRole("button", { name: "Allow AI processing" }).click();
    await expect(page.getByRole("heading", { name: "Allow AI processing" })).toHaveCount(0);

    await page.goto("/app/conversations");
    await page.getByLabel("Your question").fill("What did I discuss with Priya about the deck?");
    await page.getByRole("button", { name: "Ask" }).click();
    await expect(page.getByText("You discussed the revised deck and its Friday deadline.")).toBeVisible();
    const cite = page.getByRole("link", { name: "Deck review · message [1]" });
    await expect(cite).toBeVisible();
    await expect(page.getByText("“Thanks for the call today.")).toBeVisible();

    await page.getByLabel("Your question").fill("What did I discuss about zeppelins?");
    await page.getByRole("button", { name: "Ask" }).click();
    await expect(page.getByText("No record of that in your conversations.")).toBeVisible();

    const ws = `(select workspace_id from public.workspace_members m join auth.users u on u.id = m.user_id where u.email = ${quote(email)})`;
    expect(sql(`select count(*) from public.contacts where workspace_id = ${ws} and deleted_at is null`)).toBe("2");
    expect(Number(sql(`select cost_micro_usd from public.ai_usage_daily where workspace_id = ${ws}`))).toBeGreaterThan(0);

    // Another user sees none of it.
    const other = await browser.newContext();
    const otherPage = await other.newPage();
    await completeLink(otherPage, await acceptInvitation(otherPage, testEmail("contacts-other")));
    await otherPage.goto(contactUrl);
    await expect(otherPage.getByText("That contact no longer exists.")).toBeVisible();
    await otherPage.goto("/app/conversations?q=deck");
    await expect(otherPage.getByText("No messages match “deck”.")).toBeVisible();
    await other.close();

    // Delete a contact; its conversation stays.
    await page.goto(contactUrl);
    await page.getByRole("button", { name: "Delete contact" }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page).toHaveURL(/\/app\/contacts$/);
    await expect(page.getByRole("link", { name: /Priya Shah/ })).toHaveCount(0);
    await page.goto("/app/conversations");
    await expect(page.getByRole("link", { name: /Deck review/ })).toBeVisible();
  });
});
