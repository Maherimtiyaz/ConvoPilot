import { expect, test } from "@playwright/test";

import { quote, sql, testEmail } from "./support";

test.describe("landing page and waitlist", () => {
  test("shows the product story and links", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Nothing important slips");
    await expect(page.getByRole("heading", { name: "How it works" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Request early access" })).toBeVisible();
    await page.getByRole("link", { name: "Privacy", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Privacy notice" })).toBeVisible();
    await expect(page.getByText(/^Draft — this notice is being reviewed/)).toBeVisible();
  });

  test("joins the waitlist with the referral source, and a repeat looks identical", async ({ page }) => {
    const email = testEmail("waitlist");
    for (const attempt of [1, 2]) {
      await page.goto("about:blank");
      await page.goto("/?ref=linkedin#waitlist");
      await page.getByLabel("Name").fill("Ada Example");
      await page.getByLabel("Work email").fill(email.toUpperCase());
      await page.getByLabel("Your role").selectOption("founder");
      await page.getByLabel("Company size").selectOption("2-10");
      await page.getByLabel(/biggest communication headache/).fill(`Losing track of follow-ups (${attempt})`);
      await page.getByRole("checkbox").check();
      await page.getByRole("button", { name: "Request early access" }).click();
      await expect(page.getByRole("status")).toContainText("You're on the list.");
    }
    const row = sql(
      `select full_name || '|' || role || '|' || company_size || '|' || source || '|' || status from app_private.waitlist_entries where email_normalized = ${quote(email)}`,
    );
    expect(row).toBe("Ada Example|founder|2-10|linkedin|pending");
  });

  test("shows field errors and stores nothing for invalid input", async ({ page }) => {
    const email = testEmail("invalid");
    await page.goto("/#waitlist");
    await page.getByLabel("Work email").fill(email);
    await page.getByRole("button", { name: "Request early access" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Please check the highlighted fields." })).toBeVisible();
    await expect(page.getByText("Please tell us your name.")).toBeVisible();
    await expect(page.getByText("Please agree so we can contact you")).toBeVisible();
    expect(sql(`select count(*) from app_private.waitlist_entries where email_normalized = ${quote(email)}`)).toBe("0");
  });

  test("bot-trap submissions look successful but store nothing", async ({ page }) => {
    const email = testEmail("bot");
    await page.goto("/#waitlist");
    await page.getByLabel("Name").fill("Bot");
    await page.getByLabel("Work email").fill(email);
    await page.getByLabel("Your role").selectOption("other");
    await page.getByLabel("Company size").selectOption("solo");
    await page.getByRole("checkbox").check();
    await page.locator("#website").evaluate((input: HTMLInputElement) => (input.value = "https://spam.example"));
    await page.getByRole("button", { name: "Request early access" }).click();
    await expect(page.getByRole("status")).toContainText("You're on the list.");
    expect(sql(`select count(*) from app_private.waitlist_entries where email_normalized = ${quote(email)}`)).toBe("0");
  });
});
