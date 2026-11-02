import { expect, test } from "@playwright/test";
import { enterEmailedCode } from "./auth";
import { open } from "./helpers";

test("a new student signs up with the code from their email", async ({ page }) => {
  const email = `e2e.${Date.now()}@ashesi.edu.gh`;
  await open(page, "/sign-up?next=/me");
  await page.getByLabel("Full name").fill("Esi Mensah");
  await page.getByLabel("Ashesi email").fill(email);
  await page.getByRole("button", { name: "2027" }).click();
  await page.getByText("I’ll meet in public spots").click();
  const since = Date.now();
  await page.getByRole("button", { name: "Create account" }).click();

  await enterEmailedCode(page, email, since);
  await page.waitForURL((url) => url.pathname === "/me");
  await expect(page.getByText("Esi Mensah").first()).toBeVisible();
});

test("a wrong code is rejected", async ({ page }) => {
  const email = `e2e.wrong.${Date.now()}@ashesi.edu.gh`;
  await open(page, "/sign-up");
  await page.getByLabel("Full name").fill("Yaw Boateng");
  await page.getByLabel("Ashesi email").fill(email);
  await page.getByRole("button", { name: "2026" }).click();
  await page.getByText("I’ll meet in public spots").click();
  await page.getByRole("button", { name: "Create account" }).click();

  await page.getByLabel("Digit 1").fill("000000");
  await expect(page.getByText(/That code is wrong or has expired/)).toBeVisible();
});

test("signing in doesn't reveal whether an address has an account", async ({ page }) => {
  await open(page, "/sign-in");
  await page.getByLabel("Ashesi email").fill(`nobody.${Date.now()}@ashesi.edu.gh`);
  await page.getByRole("button", { name: "Email me a code" }).click();
  // The same screen as for a real account, with a way to sign up.
  await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
  await expect(page.getByText(/has a Hilltop account/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Create an account" })).toBeVisible();
});
