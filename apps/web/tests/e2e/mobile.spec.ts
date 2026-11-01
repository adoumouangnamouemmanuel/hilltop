import { expect, test } from "@playwright/test";
import { open, signIn } from "./helpers";

test("mobile filter sheet opens, filters and closes", async ({ page }) => {
  await open(page, "/browse?category=audio");
  await page.getByRole("button", { name: /^Filters/ }).click();
  const sheet = page.getByRole("dialog", { name: "Filters" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("checkbox", { name: /Apple/ }).locator("xpath=..").click();
  await sheet.getByRole("button", { name: /^Show 1 item/ }).click();
  await expect(sheet).toBeHidden();
  await expect(page.locator("main article")).toHaveCount(1);
});

test("message a seller from a listing, then continue in the inbox", async ({ page }) => {
  await signIn(page, "/listing/casio-fx991", "buyer");
  const field = page.getByLabel(/Message to Wellington/);
  // The layout settles as the buyer's data loads; click until the panel is open.
  await expect(async () => {
    if (!(await field.isVisible())) await page.getByRole("button", { name: "Message" }).click();
    await expect(field).toBeVisible({ timeout: 2000 });
  }).toPass();
  const note = `Is it still available? ${Date.now()}`;
  await page.getByLabel(/Message to Wellington/).fill(note);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Message sent").first()).toBeVisible();

  await page.goto("/inbox");
  await page
    .getByRole("button", { name: /Wellington/ })
    .first()
    .click();
  await expect(page.getByText(note).last()).toBeVisible();
});

test("no horizontal scrolling on key pages", async ({ page }) => {
  for (const path of ["/", "/browse", "/listing/study-table", "/sign-in", "/move-out"]) {
    await open(page, path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
