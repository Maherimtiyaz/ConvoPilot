import { expect, test } from "@playwright/test";

import { acceptInvitation, completeLink } from "./flows";
import { quote, sql, testEmail } from "./support";

// Synthetic data only.
const THREAD = `Sounds good, will do.

On Thu, 12 Mar 2026 at 09:14, Priya Shah <priya@example.com> wrote:
> Thanks for the call today. Could you send the revised deck by Friday?
> We'd also like to know if the pilot can start in March.`;

test.describe("Commitments and tasks", () => {
  test("AI suggests, only the user approves; tasks can be added, completed and reopened", async ({ page }) => {
    const email = testEmail("tasks");
    await completeLink(page, await acceptInvitation(page, email));
    const ws = `(select workspace_id from public.workspace_members m join auth.users u on u.id = m.user_id where u.email = ${quote(email)})`;

    await page.goto("/app/tasks");
    await expect(page.getByRole("heading", { name: "No tasks yet" })).toBeVisible();

    await page.goto("/app/studio");
    await page.getByLabel("Subject").fill("Deck and pilot");
    await page.getByLabel("Conversation", { exact: true }).fill(THREAD);
    await page.getByRole("button", { name: "Import conversation" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Deck and pilot" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Find commitments" })).toBeDisabled();
    await page.getByRole("button", { name: "Allow AI processing" }).click();

    // Suggestions arrive unconfirmed; the invented one (no evidence) is left out.
    await page.getByRole("button", { name: "Find commitments" }).click();
    await expect(page.getByText("3 new suggestions to review. 1 left out: no evidence in the messages.")).toBeVisible();
    const cards = page.getByTestId("commitment");
    await expect(cards).toHaveCount(3);
    await expect(cards.filter({ hasText: "Suggested · not confirmed" })).toHaveCount(3);
    await expect(page.getByText("Wire the $50k deposit")).toHaveCount(0);
    expect(sql(`select count(*) from public.tasks where workspace_id = ${ws} and status = 'open'`)).toBe("0");

    // Citations point at the messages.
    const deck = cards.filter({ hasText: "Send Priya the revised deck" });
    await expect(deck).toContainText("due by Friday");
    await deck.getByRole("button", { name: /^Source: message 1/ }).click();
    await expect(page.locator("#message-1")).toHaveClass(/border-marker/);

    // Confirm one with its task; dismiss the other person's.
    await deck.getByRole("button", { name: "Confirm and add task" }).click();
    await expect(deck).toContainText("Confirmed");
    await expect(deck.getByRole("link", { name: "on your task list" })).toBeVisible();
    await cards.filter({ hasText: "Priya shares notes" }).getByRole("button", { name: "Not a commitment" }).click();
    await expect(page.getByText("1 dismissed suggestion hidden")).toBeVisible();

    // Running it again does not duplicate anything.
    await page.getByRole("button", { name: "Find commitments" }).click();
    await expect(page.getByText("No new commitments found. 3 already listed.", { exact: false })).toBeVisible();
    await expect(cards).toHaveCount(2);

    // The remaining suggestion is approved from the Tasks page.
    await page.goto("/app/tasks");
    const waiting = page.getByRole("region", { name: /Waiting for your approval/ });
    await expect(waiting.getByTestId("task")).toHaveCount(1);
    await expect(waiting).toContainText("Commitment: Tell Priya whether the pilot can start in March");
    await waiting.getByRole("button", { name: "Approve: Reply about the pilot start" }).click();
    await expect(page.getByRole("region", { name: /Waiting for your approval/ })).toHaveCount(0);
    const open = page.getByRole("region", { name: /^Open/ });
    await expect(open.getByTestId("task")).toHaveCount(2);
    await expect(open.getByTestId("task").filter({ hasText: "Send the revised deck" })).toContainText("due by Friday (no date set)");

    // The user's own task, overdue.
    await page.getByLabel("Task", { exact: true }).fill("Book flights");
    await page.getByLabel("Due date (optional)").fill("2026-01-05");
    await page.getByLabel("Priority").selectOption("high");
    await page.getByRole("button", { name: "Add task" }).click();
    await expect(open.getByTestId("task").filter({ hasText: "Book flights" })).toContainText("overdue");

    // Complete, then reopen.
    await page.getByRole("button", { name: "Mark done: Send the revised deck" }).click();
    const closed = page.getByRole("region", { name: /Done and dismissed/ });
    await expect(closed.getByTestId("task").filter({ hasText: "Send the revised deck" })).toBeVisible();
    await page.getByRole("button", { name: "Reopen: Send the revised deck" }).click();
    await expect(open.getByTestId("task")).toHaveCount(3);

    // Dashboard reflects it.
    await page.goto("/app");
    await expect(page.getByRole("link", { name: /3\s*Open tasks/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /1\s*Overdue/ })).toBeVisible();

    // Every decision is the user's, and audited.
    expect(sql(`select string_agg(status, ',' order by description) from public.commitments where workspace_id = ${ws}`)).toBe("rejected,confirmed,confirmed");
    expect(Number(sql(`select count(*) from public.audit_events where workspace_id = ${ws} and action in ('commitment.confirmed', 'task.approved', 'commitment.rejected')`))).toBe(5);
  });
});
