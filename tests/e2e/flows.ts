import { expect, type Page } from "@playwright/test";

import { createInvitation, latestEmailLink } from "./support";

/** Uses a fresh invitation for `email` through the /invite page; returns the emailed sign-in link. */
export async function acceptInvitation(page: Page, email: string, token: string = createInvitation(email)) {
  await page.goto(`/invite#t=${token}`);
  await expect(page.getByLabel(/email address this invitation was sent to/)).toBeVisible();
  expect(page.url()).not.toContain(token);
  await page.getByLabel(/email address this invitation was sent to/).fill(email);
  await page.getByRole("button", { name: "Create my account" }).click();
  await expect(page).toHaveURL(/\/auth\/check-email$/);
  return latestEmailLink(email);
}

/** Opens an emailed link and presses Continue; ends signed in on /app. */
export async function completeLink(page: Page, link: string) {
  await page.goto(link);
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  expect(page.url()).not.toContain("#th=");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/app$/);
}
