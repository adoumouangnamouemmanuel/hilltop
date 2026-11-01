import { readFileSync } from "node:fs";
import { expect, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { stateFile, type Who } from "./auth";

/** Navigates and waits until React has hydrated, so typing and key presses aren't lost. */
export async function open(page: Page, url: string) {
  await page.goto(url);
  await page.locator("html[data-hydrated='true']").waitFor({ state: "attached" });
}

/**
 * Opens `next` signed in as a test student (Kofi by default, who has a shop), reusing
 * the session the global setup created by signing in for real.
 */
export async function signIn(page: Page, next = "/", who: Who = "student") {
  const { cookies } = JSON.parse(readFileSync(stateFile(who), "utf8")) as { cookies: Parameters<BrowserContext["addCookies"]>[0] };
  await page.context().addCookies(cookies);
  await open(page, next);
}

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator("[aria-live='polite']").getByText(text).first()).toBeVisible();
}

/** Clicks a button that opens a panel until `field` shows: the layout settles as the student's data loads. */
export async function openPanel(page: Page, button: string, field: Locator) {
  await expect(async () => {
    if (!(await field.isVisible())) await page.getByRole("button", { name: button }).click();
    await expect(field).toBeVisible({ timeout: 2000 });
  }).toPass();
}
