import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

test("sign in, buy with protection, confirm collection and review the seller", async ({ page }) => {
  await signIn(page, "/listing/iphone-x");
  await expect(page.getByRole("heading", { level: 1, name: "iPhone X, 64GB, space grey" })).toBeVisible();

  await page.getByRole("button", { name: "Buy now" }).first().click();
  const checkout = page.getByRole("dialog", { name: "Checkout" });
  await expect(checkout).toBeVisible();
  await checkout.getByRole("button", { name: /^Pay GH₵/ }).click();

  await expect(page.getByText(/is held safely/)).toBeVisible();
  await page.getByRole("link", { name: "View order" }).click();
  await page.waitForURL("**/me");

  // The newest purchase is first: paid and awaiting pickup.
  const order = page.locator("li").filter({ hasText: "iPhone X, 64GB" }).first();
  await expect(order.getByText("Paid, awaiting pickup")).toBeVisible();

  await order.getByRole("button", { name: "I’ve collected it" }).click();
  await order.getByRole("button", { name: "Yes, release payment" }).click();
  await expect(order.getByText("Completed")).toBeVisible();

  const review = page.getByRole("dialog", { name: /Review/ });
  await expect(review).toBeVisible();
  await review.getByRole("radio", { name: "5 stars" }).click();
  await review.getByRole("button", { name: "Item as described" }).click();
  await review.getByRole("button", { name: "Post review" }).click();
  await expect(page.getByRole("dialog", { name: "Thanks!" })).toBeVisible();
});

test("the bought item is shown as sold afterwards", async ({ page }) => {
  await signIn(page, "/listing/xiaomi-redmi");
  await page.getByRole("button", { name: "Buy now" }).first().click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /^Pay GH₵/ })
    .click();
  await expect(page.getByText(/is held safely/)).toBeVisible();
  await page.getByRole("button", { name: "Keep browsing" }).click();
  await expect(page.getByText("This item has sold")).toBeVisible();
});

test("report a problem freezes the payment", async ({ page }) => {
  await signIn(page, "/me");
  const order = page.locator("li").filter({ hasText: "Calculus: Early Transcendentals" }).first();
  await order.getByRole("button", { name: "Report a problem" }).click();
  const sheet = page.getByRole("dialog", { name: "Report a problem" });
  await sheet.getByText("Not as described").click();
  await sheet.getByRole("button", { name: "Report and freeze payment" }).click();
  await expect(order.getByText("Under review")).toBeVisible();
  await expect(order.getByText(/You reported a problem/)).toBeVisible();

  await order.getByRole("button", { name: "Withdraw report" }).click();
  await expect(order.getByText("Ready for pickup")).toBeVisible();
});

test("sellers mark incoming orders ready", async ({ page }) => {
  await signIn(page, "/me");
  await page.getByRole("tab", { name: /Selling/ }).click();
  const sale = page.locator("li").filter({ hasText: "White smartwatch" }).first();
  await expect(sale.getByText("Payout: Held by Hilltop")).toBeVisible();
  await sale.getByRole("button", { name: "Mark ready for pickup" }).click();
  await expect(sale.getByText("Ready for pickup")).toBeVisible();
});

test("cheaper items are reserved and paid at pickup, with optional protection", async ({ page }) => {
  await signIn(page, "/listing/casio-fx991");
  await page.getByRole("button", { name: "Buy now" }).first().click();
  const checkout = page.getByRole("dialog", { name: "Checkout" });
  // Off by default below the protection threshold; switching it on adds the fee.
  await checkout.getByRole("switch", { name: "Buyer protection" }).click();
  await expect(checkout.getByRole("button", { name: /^Pay GH₵/ })).toBeVisible();
  await checkout.getByRole("switch", { name: "Buyer protection" }).click();
  await checkout.getByRole("button", { name: "Reserve, pay at pickup" }).click();

  await expect(page.getByText("Reserved for you")).toBeVisible();
  await page.getByRole("link", { name: "View order" }).click();
  await page.waitForURL("**/me");
  const order = page.locator("li").filter({ hasText: "Casio fx-991ES Plus" }).first();
  await expect(order.getByText("Reserved, pay at pickup")).toBeVisible();
  await expect(order.getByRole("button", { name: "Report a problem" })).toHaveCount(0);
});
