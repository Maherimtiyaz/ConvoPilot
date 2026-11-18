import { expect, test } from "@playwright/test";

import { acceptInvitation, completeLink } from "./flows";
import { createInvitation, emailCount, latestEmailLink, quote, sql, testEmail } from "./support";

test.describe("sign-in and protected app", () => {
  test("signed-out visitors are sent to the login page", async ({ page }) => {
    for (const path of ["/app", "/app/settings", "/app/studio"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login$/);
    }
  });

  test("invited person creates an account, uses every screen and signs out", async ({ page, context }) => {
    const email = testEmail("invitee");
    const link = await acceptInvitation(page, email);

    // A link scanner fetching the page cannot use the link: the token never reaches the server.
    const scanned = await page.request.get(link);
    expect(scanned.status()).toBe(200);

    await completeLink(page, link);
    await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
    expect(sql(`select count(*) from public.workspace_members m join auth.users u on u.id = m.user_id where u.email = ${quote(email)}`)).toBe("1");

    const cookies = await context.cookies();
    const session = cookies.filter((c) => c.name.startsWith("sb-"));
    expect(session.length).toBeGreaterThan(0);
    for (const cookie of session) {
      expect(cookie.httpOnly).toBe(true);
      expect(cookie.sameSite).toBe("Lax");
      expect(cookie.expires - Date.now() / 1000).toBeLessThanOrEqual(30 * 24 * 3600 + 60);
    }

    for (const [name, heading] of [
      ["Communication Studio", "Communication Studio"],
      ["Contacts", "Contacts"],
      ["Conversations", "Conversations"],
      ["Tasks", "Tasks"],
      ["Settings", "Settings"],
      ["Dashboard", "Dashboard"],
    ] as const) {
      await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name, exact: true }).click();
      await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    }

    await page.goto("/app/settings");
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/app");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("a used link cannot be used again", async ({ page, browser }) => {
    const email = testEmail("reuse");
    const link = await acceptInvitation(page, email);
    await completeLink(page, link);

    const other = await browser.newContext();
    const second = await other.newPage();
    await second.goto(link);
    await second.getByRole("button", { name: "Continue" }).click();
    await expect(second.getByRole("alert").filter({ hasText: /./ })).toContainText("invalid or has expired");
    await second.goto("/app");
    await expect(second).toHaveURL(/\/login$/);
    await other.close();
  });

  test("returning user signs in with an email link; unknown emails see the same page", async ({ page }) => {
    const email = testEmail("returning");
    await completeLink(page, await acceptInvitation(page, email));
    await page.context().clearCookies();

    await page.goto("/login");
    await page.getByLabel("Email address").fill(email);
    await page.getByRole("button", { name: "Email me a sign-in link" }).click();
    await expect(page).toHaveURL(/\/auth\/check-email$/);
    await completeLink(page, await latestEmailLink(email));

    const unknown = testEmail("unknown");
    await page.context().clearCookies();
    await page.goto("/login");
    await page.getByLabel("Email address").fill(unknown);
    await page.getByRole("button", { name: "Email me a sign-in link" }).click();
    await expect(page).toHaveURL(/\/auth\/check-email$/);
    expect(await emailCount(unknown)).toBe(0);
    expect(sql(`select count(*) from auth.users where email = ${quote(unknown)}`)).toBe("0");
  });

  test("an invitation cannot be used with a different email", async ({ page }) => {
    const token = createInvitation(testEmail("bound"));
    const intruder = testEmail("intruder");
    await page.goto(`/invite#t=${token}`);
    await page.getByLabel(/email address this invitation was sent to/).fill(intruder);
    await page.getByRole("button", { name: "Create my account" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /./ })).toContainText("This invitation can't be used");
    expect(sql(`select count(*) from auth.users where email = ${quote(intruder)}`)).toBe("0");
  });

  test("signing out everywhere revokes other sessions", async ({ page, browser }) => {
    const email = testEmail("global");
    await completeLink(page, await acceptInvitation(page, email));

    const other = await browser.newContext();
    const second = await other.newPage();
    await second.goto("/login");
    await second.getByLabel("Email address").fill(email);
    await second.getByRole("button", { name: "Email me a sign-in link" }).click();
    await completeLink(second, await latestEmailLink(email));

    await page.goto("/app/settings");
    await page.getByRole("button", { name: "Sign out everywhere" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await second.goto("/app/settings");
    await expect(second).toHaveURL(/\/login$/);
    await other.close();
  });

  test("an invitation link without a token explains what to do", async ({ page }) => {
    await page.goto("/invite");
    await expect(page.getByRole("alert").filter({ hasText: /./ })).toContainText("This invitation link is incomplete");
    await page.goto("/auth/confirm");
    await expect(page.getByRole("alert").filter({ hasText: /./ })).toContainText("invalid or has expired");
  });

  test("responses carry security headers", async ({ request }) => {
    const response = await request.get("/login");
    const headers = response.headers();
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("no-referrer");
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-powered-by"]).toBeUndefined();
  });
});
