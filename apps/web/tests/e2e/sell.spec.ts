import path from "node:path";
import { expect, test } from "@playwright/test";
import { quickSignIn, signIn } from "./helpers";

const photo = path.join(__dirname, "..", "..", "public", "icons", "icon-512.png");

test("publishing needs the basics and explains what's missing", async ({ page }) => {
  await quickSignIn(page, "/sell");
  await page.getByRole("button", { name: "Publish listing" }).click();
  await expect(page.getByText("Add at least one photo")).toBeVisible();
  await expect(page.getByText("Pick a category")).toBeVisible();
  await expect(page.getByText("Set a price")).toBeVisible();
});

test("publish a listing with category-specific details", async ({ page }) => {
  await quickSignIn(page, "/sell");

  await page.locator('input[type="file"]').setInputFiles(photo);
  await expect(page.getByRole("button", { name: "Cover photo" })).toBeVisible();

  await page.getByRole("radio", { name: "Calculators" }).click();
  await expect(page.getByRole("heading", { name: "Calculators details" })).toBeVisible();
  await page.getByRole("button", { name: "Casio fx-991EX", exact: true }).click();
  await page.getByRole("switch", { name: "Allowed in exams" }).click();

  await page.getByLabel("Title").fill("Casio fx-991EX ClassWiz");
  await page.getByRole("radio", { name: /^Like new/ }).click();
  await page.getByLabel("Your price").fill("220");

  await page.getByRole("button", { name: "Publish listing" }).click();
  await page.waitForURL(/\/listing\/my-/);
  await expect(page.getByRole("heading", { level: 1, name: "Casio fx-991EX ClassWiz" })).toBeVisible();
  await expect(page.getByRole("definition").filter({ hasText: "Yes" }).first()).toBeVisible();
  await expect(page.getByText("Allowed in exams").first()).toBeVisible();

  // It's searchable straight away.
  await page.goto("/browse?category=calculators&f.exam=true");
  await expect(page.locator("main article").filter({ hasText: "Casio fx-991EX ClassWiz" })).toHaveCount(1);
});

test("save a draft, then find it under your listings", async ({ page }) => {
  await quickSignIn(page, "/sell");
  await page.getByLabel("Title").fill("Half-finished lamp listing");
  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(page).toHaveURL(/edit=my-/);
  await expect(page.getByRole("heading", { level: 1, name: "Finish your draft" })).toBeVisible();

  await page.goto("/me?tab=selling");
  await page.getByRole("tab", { name: /Drafts/ }).click();
  await expect(page.getByText("Half-finished lamp listing")).toBeVisible();
});

test("expired listings can be renewed", async ({ page }) => {
  await signIn(page, "/me");
  await page.getByRole("tab", { name: /Selling/ }).click();
  await page.getByRole("tab", { name: /Expired/ }).click();
  const row = page.locator("li").filter({ hasText: "Adjustable desk lamp" });
  await expect(row.getByText("Hidden from buyers")).toBeVisible();
  await row.getByRole("button", { name: /Actions for Adjustable desk lamp/ }).click();
  await page.getByRole("menuitem", { name: "Renew listing" }).click();
  await page.getByRole("tab", { name: /Active/ }).click();
  await expect(page.locator("li").filter({ hasText: "Adjustable desk lamp" })).toBeVisible();
});
