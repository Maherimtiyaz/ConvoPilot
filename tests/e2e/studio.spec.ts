import { expect, test } from "@playwright/test";

import { acceptInvitation, completeLink } from "./flows";
import { quote, sql, testEmail } from "./support";

const THREAD = `Sounds good, will do.

On Thu, 12 Mar 2026 at 09:14, Priya Shah <priya@example.com> wrote:
> Thanks for the call today. Could you send the revised deck by Friday?
> We'd also like to know if the pilot can start in March.`;

test.describe("Communication Studio", () => {
  test("import, consent, analyse with citations, draft, edit, delete", async ({ page }) => {
    const email = testEmail("studio");
    await completeLink(page, await acceptInvitation(page, email));

    // Writing style in Settings is used for drafts.
    await page.goto("/app/settings");
    await page.getByLabel("Sign-off").fill("Best, Ada");
    await page.getByRole("button", { name: "Save style" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();

    await page.goto("/app/studio");
    await expect(page.getByRole("heading", { name: "Import a conversation" })).toBeVisible();
    await page.getByLabel("Subject").fill("Pilot timing");
    await page.getByLabel("Conversation", { exact: true }).fill(THREAD);
    await page.getByRole("button", { name: "Import conversation" }).click();

    await expect(page.getByRole("heading", { level: 2, name: "Pilot timing" })).toBeVisible();
    const messages = page.getByRole("list").filter({ has: page.locator("#message-1") });
    await expect(messages.getByRole("listitem")).toHaveCount(2);
    await expect(page.locator("#message-1")).toContainText("Priya Shah");
    await expect(page.locator("#message-1")).toContainText("Could you send the revised deck by Friday?");

    // AI needs consent first.
    await expect(page.getByRole("button", { name: "Analyse", exact: true })).toBeDisabled();
    await page.getByRole("button", { name: "Allow AI processing" }).click();
    await expect(page.getByRole("heading", { name: "Allow AI processing" })).toHaveCount(0);

    await page.getByRole("button", { name: "Analyse", exact: true }).click();
    await expect(page.getByText("They want the revised deck by Friday.")).toBeVisible();
    await expect(page.getByText("1 unsupported statement removed")).toBeVisible();
    await expect(page.getByText("An invented point with no evidence.")).toHaveCount(0);
    await page.getByRole("button", { name: /^Source: message 1/ }).first().click();
    await expect(page.locator("#message-1")).toHaveClass(/border-marker/);

    await page.getByRole("button", { name: "Draft reply" }).click();
    const draft = page.getByLabel(/Latest draft/);
    await expect(draft).toHaveValue(/you'll have the revised deck by Friday/);
    await draft.fill("Hi Priya, yes, the deck will be with you on Friday. Ada");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();

    const ws = `(select workspace_id from public.workspace_members m join auth.users u on u.id = m.user_id where u.email = ${quote(email)})`;
    expect(sql(`select count(*) from public.thread_analyses where workspace_id = ${ws}`)).toBe("1");
    expect(Number(sql(`select count(*) from public.citations where workspace_id = ${ws}`))).toBeGreaterThanOrEqual(2);
    expect(sql(`select content from public.drafts where workspace_id = ${ws}`)).toContain("on Friday. Ada");
    expect(Number(sql(`select cost_micro_usd from public.ai_usage_daily where workspace_id = ${ws}`))).toBeGreaterThan(0);
    await expect(page.getByText(/AI spend today: \$0\.\d\d of \$1\.00/)).toBeVisible();

    // Importing the same thread again opens the existing copy.
    await page.goto("/app/studio");
    await page.getByLabel("Conversation", { exact: true }).fill(THREAD);
    await page.getByRole("button", { name: "Import conversation" }).click();
    await expect(page.getByText("You'd already imported this conversation")).toBeVisible();

    await page.getByRole("button", { name: "Delete conversation" }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Import a conversation" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Pilot timing/ })).toHaveCount(0);
    expect(sql(`select count(*) from public.conversations where workspace_id = ${ws} and deleted_at is null`)).toBe("0");
  });

  test("uploads an .eml file and keeps other users out", async ({ page, browser }) => {
    await completeLink(page, await acceptInvitation(page, testEmail("studio-eml")));
    await page.goto("/app/studio");
    await page.getByRole("tab", { name: "Upload file" }).click();
    const eml = [
      "From: Mateo Example <mateo@example.com>",
      "Subject: Intro to Dana",
      "Date: Fri, 13 Mar 2026 10:00:00 +0000",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Could you introduce me to Dana next week?",
    ].join("\r\n");
    await page.getByLabel("File").setInputFiles({ name: "intro.eml", mimeType: "message/rfc822", buffer: Buffer.from(eml) });
    await page.getByRole("button", { name: "Import conversation" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Intro to Dana" })).toBeVisible();
    await expect(page.locator("#message-1")).toContainText("mateo@example.com");
    const url = page.url();

    const other = await browser.newContext();
    const intruder = await other.newPage();
    await completeLink(intruder, await acceptInvitation(intruder, testEmail("studio-intruder")));
    await intruder.goto(url);
    await expect(intruder.getByRole("alert").filter({ hasText: "That conversation no longer exists." })).toBeVisible();
    await expect(intruder.getByText("Could you introduce me to Dana")).toHaveCount(0);
    await other.close();
  });

  test("rejects unsupported files with a clear message", async ({ page }) => {
    await completeLink(page, await acceptInvitation(page, testEmail("studio-bad")));
    await page.goto("/app/studio");
    await page.getByRole("tab", { name: "Upload file" }).click();
    await page.getByLabel("File").setInputFiles({ name: "deck.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
    await page.getByRole("button", { name: "Import conversation" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Choose a .txt, .md or .eml file" })).toBeVisible();
  });

  test("imports a WhatsApp chat export: latest messages, local times, no media", async ({ page }) => {
    const email = testEmail("studio-whatsapp");
    await completeLink(page, await acceptInvitation(page, email));
    const ws = `(select workspace_id from public.workspace_members m join auth.users u on u.id = m.user_id where u.email = ${quote(email)})`;
    sql(`update public.workspace_settings set time_zone = 'Asia/Kolkata' where workspace_id = ${ws}`);

    // Synthetic Android export: an encryption notice, 54 messages (one is media) → newest 50 kept.
    const lines = ["12/03/2026, 09:00 - Messages and calls are end-to-end encrypted. No one outside of this chat can read them."];
    for (let i = 1; i <= 52; i++) lines.push(`12/03/2026, 09:${String(i).padStart(2, "0")} - ${i % 2 ? "Priya Shah" : "Ada Example"}: Update ${i}`);
    lines.push("12/03/2026, 10:00 - Priya Shah: <Media omitted>");
    lines.push("12/03/2026, 10:01 - Priya Shah: Could you send the revised deck by Friday?", "It's for the board.");
    await page.goto("/app/studio");
    await page.getByRole("tab", { name: "Upload file" }).click();
    await page.getByLabel("File").setInputFiles({ name: "WhatsApp Chat with Priya Shah.txt", mimeType: "text/plain", buffer: Buffer.from(lines.join("\n")) });
    await page.getByRole("button", { name: "Import conversation" }).click();

    await expect(page.getByRole("heading", { level: 2, name: "WhatsApp chat with Priya Shah" })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "we imported the latest 50 messages. 3 older messages were left out." })).toBeVisible();
    await expect(page.locator("#message-50")).toContainText("Could you send the revised deck by Friday?\nIt's for the board.", { useInnerText: true });
    await expect(page.getByText("Media omitted")).toHaveCount(0);
    expect(sql(`select count(*) from public.messages where workspace_id = ${ws}`)).toBe("50");
    // 10:01 in India (UTC+5:30) is 04:31 UTC.
    expect(sql(`select to_char(max(sent_at) at time zone 'UTC', 'YYYY-MM-DD HH24:MI') from public.messages where workspace_id = ${ws}`)).toBe("2026-03-12 04:31");

    // After the user tells Settings their WhatsApp name, their messages are marked as theirs.
    const chatUrl = page.url().replace(/&older=\d+/, "");
    await expect(page.locator("#message-49").getByText("you", { exact: true })).toHaveCount(0);
    await page.goto("/app/settings");
    await page.getByLabel("Names (separate with commas)").fill("ada example,  Ada");
    await page.getByRole("button", { name: "Save names" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
    await page.goto(chatUrl);
    await expect(page.locator("#message-49").getByText("you", { exact: true })).toBeVisible();
    await expect(page.locator("#message-50").getByText("you", { exact: true })).toHaveCount(0);
    expect(sql(`select array_to_string(chat_names, '|') from public.workspace_settings where workspace_id = ${ws}`)).toBe("ada example|Ada");
  });
});
