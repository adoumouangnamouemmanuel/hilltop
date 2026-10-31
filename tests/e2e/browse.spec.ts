import { expect, test } from "@playwright/test";
import { open } from "./helpers";

const cards = (page: import("@playwright/test").Page) => page.locator("main article");

test("category filters narrow results and live in the URL", async ({ page }) => {
  await open(page, "/browse?category=jewellery");
  await expect(page.getByRole("heading", { level: 1, name: "Jewellery & watches" })).toBeVisible();
  const all = await cards(page).count();
  expect(all).toBeGreaterThan(5);

  // Type chips come from the category schema.
  await page.getByRole("button", { name: "Bracelet", exact: true }).first().click();
  await expect(page).toHaveURL(/f\.type=Bracelet/);
  await expect(cards(page)).toHaveCount(3);

  // A second attribute narrows further.
  // Click the visible label, as a user would; the real input is visually hidden.
  await page
    .getByRole("checkbox", { name: /Gold-plated/ })
    .locator("xpath=..")
    .click();
  await expect(page).toHaveURL(/f\.material=Gold-plated/);
  await expect(cards(page)).toHaveCount(2);

  // The URL alone restores the same view.
  const url = page.url();
  await open(page, url);
  await expect(cards(page)).toHaveCount(2);

  // Removing chips widens again.
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(cards(page).first()).toBeVisible();
  expect(await cards(page).count()).toBeGreaterThanOrEqual(all);
});

test("switching category drops filters that don't apply", async ({ page }) => {
  await open(page, "/browse?category=phones&f.brand=Apple");
  await expect(page.getByRole("heading", { level: 1, name: "Phones" })).toBeVisible();
  await page
    .getByRole("button", { name: /^Calculators/ })
    .first()
    .click();
  await expect(page).toHaveURL(/category=calculators/);
  await expect(page).not.toHaveURL(/f\.brand/);
});

test("search suggests listings and opens results", async ({ page }) => {
  await open(page, "/browse");
  const search = page.getByRole("combobox", { name: "Search Hilltop" }).first();
  await search.fill("casio");
  await expect(page.getByRole("option", { name: /Casio fx-991ES Plus/ })).toBeVisible();
  await search.press("Enter");
  await expect(page).toHaveURL(/q=casio/);
  await expect(page.getByRole("heading", { level: 1, name: "Results for “casio”" })).toBeVisible();
  await expect(cards(page).filter({ hasText: "Casio fx-991ES Plus" })).toHaveCount(1);
});

test("empty results offer a way out", async ({ page }) => {
  await open(page, "/browse?q=zzzznothing");
  await expect(page.getByText("No matching items")).toBeVisible();
});

test("sort menu works with the keyboard", async ({ page }) => {
  await open(page, "/browse?category=phones");
  const sort = page.getByRole("combobox", { name: /^Sort/ });
  await sort.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("listbox", { name: "Sort" })).toBeVisible();
  // Best match -> Newest -> Price low to high
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/sort=price-asc/);
  await expect(sort).toBeFocused();
});
