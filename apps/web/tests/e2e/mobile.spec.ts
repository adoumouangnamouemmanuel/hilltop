import { expect, test } from "@playwright/test";
import { open, quickSignIn } from "./helpers";

test("mobile filter sheet opens, filters and closes", async ({ page }) => {
  await open(page, "/browse?category=phones");
  await page.getByRole("button", { name: /^Filters/ }).click();
  const sheet = page.getByRole("dialog", { name: "Filters" });
  await expect(sheet).toBeVisible();
  await sheet
    .getByRole("checkbox", { name: /Samsung/ })
    .locator("xpath=..")
    .click();
  await sheet.getByRole("button", { name: /^Show 1 item/ }).click();
  await expect(sheet).toBeHidden();
  await expect(page.locator("main article")).toHaveCount(1);
});

test("chat with a seller from the inbox", async ({ page }) => {
  await quickSignIn(page, "/inbox");
  await page.getByRole("button", { name: /Ama Owusu/ }).click();
  await page.getByLabel("Message Ama Owusu").fill("Can we meet today?");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Can we meet today?").last()).toBeVisible();
  // The demo seller replies a moment later.
  await expect(page.getByText(/Library entrance around 4pm/).last()).toBeVisible();
});

test("no horizontal scrolling on key pages", async ({ page }) => {
  for (const path of ["/", "/browse", "/listing/macbook-air-m1", "/sign-in", "/move-out"]) {
    await open(page, path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
