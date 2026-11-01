import { readFileSync } from "node:fs";
import { expect, type BrowserContext, type Page } from "@playwright/test";
import { studentState } from "./auth";

/** Navigates and waits until React has hydrated, so typing and key presses aren't lost. */
export async function open(page: Page, url: string) {
  await page.goto(url);
  await page.locator("html[data-hydrated='true']").waitFor({ state: "attached" });
}

/** Opens `next` signed in as the test student, reusing the session the global setup created by signing in for real. */
export async function signIn(page: Page, next = "/") {
  const { cookies } = JSON.parse(readFileSync(studentState, "utf8")) as { cookies: Parameters<BrowserContext["addCookies"]>[0] };
  await page.context().addCookies(cookies);
  await open(page, next);
}

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator("[aria-live='polite']").getByText(text).first()).toBeVisible();
}
