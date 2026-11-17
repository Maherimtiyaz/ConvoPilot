import { expect, test } from "@playwright/test";

import { acceptInvitation, completeLink } from "./flows";
import { quote, sql, testEmail } from "./support";

function addToWaitlist(email: string, name: string) {
  sql(`insert into app_private.waitlist_entries (email_normalized, full_name, role, company_size, consent_at, source)
       values (${quote(email)}, ${quote(name)}, 'founder', 'solo', now(), 'e2e')`);
}

test.describe("operator console", () => {
  test("members cannot see or use the console", async ({ page }) => {
    await completeLink(page, await acceptInvitation(page, testEmail("not-operator")));
    await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Operator" })).toHaveCount(0);
    await page.goto("/app/operator");
    await expect(page.getByRole("heading", { name: "Operators only" })).toBeVisible();
  });

  test("operator invites from the waitlist, and the invitee creates an account", async ({ page, browser }) => {
    const operator = testEmail("operator");
    await completeLink(page, await acceptInvitation(page, operator));
    sql(`insert into app_private.platform_operators (user_id) select id from auth.users where email = ${quote(operator)}`);

    const invitee = testEmail("invitee-wl");
    const declined = testEmail("declined-wl");
    addToWaitlist(invitee, "Grace Example");
    addToWaitlist(declined, "Dan Example");

    await page.goto("/app/operator");
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Operator" }).waitFor();
    await expect(page.getByRole("heading", { level: 1, name: "Operator console" })).toBeVisible();

    // Decline one entry: it leaves the pending view.
    const danRow = page.getByRole("row").filter({ hasText: declined });
    await danRow.getByRole("button", { name: "Decline" }).click();
    await expect(page.getByRole("row").filter({ hasText: declined })).toHaveCount(0);
    expect(sql(`select status from app_private.waitlist_entries where email_normalized = ${quote(declined)}`)).toBe("declined");

    await page.getByRole("checkbox", { name: "Select Grace Example" }).check();
    await page.getByRole("button", { name: "Invite selected (1)" }).click();
    await expect(page.getByRole("heading", { name: "1 invitation created" })).toBeVisible();
    const linkText = await page.locator("li").filter({ hasText: invitee }).locator(".font-mono").innerText();
    expect(linkText).toMatch(/^http:\/\/127\.0\.0\.1:3000\/invite#t=[A-Za-z0-9_-]{43}$/);
    expect(sql(`select status from app_private.waitlist_entries where email_normalized = ${quote(invitee)}`)).toBe("invited");

    // The invitee uses the link in their own browser.
    const other = await browser.newContext();
    const guest = await other.newPage();
    const token = linkText.split("#t=")[1];
    await completeLink(guest, await acceptInvitation(guest, invitee, token));
    await expect(guest.getByText(`Signed in as ${invitee}`)).toBeVisible();
    await other.close();

    await page.goto("/app/operator?view=invitations");
    await expect(page.getByRole("row").filter({ hasText: invitee }).getByText("accepted")).toBeVisible();
  });

  test("operator can revoke an open invitation", async ({ page }) => {
    const operator = testEmail("operator-revoke");
    await completeLink(page, await acceptInvitation(page, operator));
    sql(`insert into app_private.platform_operators (user_id) select id from auth.users where email = ${quote(operator)}`);
    const person = testEmail("revoke-wl");
    addToWaitlist(person, "Rae Example");

    await page.goto("/app/operator");
    await page.getByRole("checkbox", { name: "Select Rae Example" }).check();
    await page.getByRole("button", { name: "Invite selected (1)" }).click();
    await expect(page.getByRole("heading", { name: "1 invitation created" })).toBeVisible();

    await page.goto("/app/operator?view=invitations");
    const row = page.getByRole("row").filter({ hasText: person });
    await row.getByRole("button", { name: "Revoke" }).click();
    await expect(row.getByText("revoked")).toBeVisible();
    expect(sql(`select count(*) from app_private.invitations where email_normalized = ${quote(person)} and revoked_at is not null`)).toBe("1");
  });
});
