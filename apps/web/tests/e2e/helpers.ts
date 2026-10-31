import { expect, type Page } from "@playwright/test";

/** Navigates and waits until React has hydrated, so typing and key presses aren't lost. */
export async function open(page: Page, url: string) {
  await page.goto(url);
  await page.locator("html[data-hydrated='true']").waitFor({ state: "attached" });
}

/** Signs in through the email + code flow (any 6 digits work in the demo). */
export async function signIn(page: Page, next = "/") {
  await open(page, `/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Ashesi email").fill("kofi.darko@ashesi.edu.gh");
  await page.getByRole("button", { name: "Email me a code" }).click();
  await page.getByLabel("Digit 1").fill("123456");
  await page.waitForURL((url) => url.pathname === next);
  await page.locator("html[data-hydrated='true']").waitFor({ state: "attached" });
}

/** Signs in via the single sign-on button, the quickest route. */
export async function quickSignIn(page: Page, next = "/") {
  await open(page, `/sign-in?next=${encodeURIComponent(next)}`);
  await page.getByRole("button", { name: "Continue with Ashesi Microsoft" }).click();
  await page.waitForURL((url) => url.pathname === next);
  await page.locator("html[data-hydrated='true']").waitFor({ state: "attached" });
}

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator("[aria-live='polite']").getByText(text).first()).toBeVisible();
}
