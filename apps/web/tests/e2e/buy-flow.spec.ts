import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

// Until paying in the app is switched on, every order is reserved and paid to the seller at pickup.

test("reserve an item, the seller hands it over, then review them", async ({ browser }) => {
  const buyer = await (await browser.newContext()).newPage();
  const seller = await (await browser.newContext()).newPage();

  await signIn(buyer, "/listing/my-desk-fan", "buyer");
  await buyer.getByRole("button", { name: "Buy now" }).first().click();
  const checkout = buyer.getByRole("dialog", { name: "Checkout" });
  await expect(checkout.getByRole("switch", { name: "Buyer protection" })).toHaveCount(0);
  await checkout.getByRole("button", { name: "Reserve, pay at pickup" }).click();
  await expect(buyer.getByText("Reserved for you")).toBeVisible();
  await buyer.getByRole("link", { name: "View order" }).click();
  await buyer.waitForURL("**/me");
  await expect(buyer.locator("li").filter({ hasText: "Rechargeable desk fan" }).first().getByText("Reserved, pay at pickup")).toBeVisible();

  // Kofi is told, marks it ready, then hands it over and is paid in person.
  await signIn(seller, "/me?tab=selling");
  const sale = seller.locator("li").filter({ hasText: "Rechargeable desk fan" }).filter({ hasText: "Esi Mensah" }).first();
  await sale.getByRole("button", { name: "Mark ready for pickup" }).click();
  await expect(sale.getByText("Ready for pickup")).toBeVisible();
  await sale.getByRole("button", { name: "Collected and paid" }).click();
  await expect(sale.getByText("Completed")).toBeVisible();

  await buyer.reload();
  const order = buyer.locator("li").filter({ hasText: "Rechargeable desk fan" }).first();
  await expect(order.getByText("Completed")).toBeVisible();
  await order.getByRole("button", { name: /Leave a review/ }).click();
  const review = buyer.getByRole("dialog", { name: /Review/ });
  await review.getByRole("radio", { name: "5 stars" }).click();
  await review.getByRole("button", { name: "Post review" }).click();
  await expect(buyer.getByRole("dialog", { name: "Thanks!" })).toBeVisible();
});

test("a one-off item is shown as sold once reserved, and is back if cancelled", async ({ page }) => {
  await signIn(page, "/listing/lace-dress", "buyer");
  await page.getByRole("button", { name: "Buy now" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Reserve, pay at pickup" }).click();
  await expect(page.getByText("Reserved for you")).toBeVisible();
  await page.getByRole("button", { name: "Keep browsing" }).click();
  await expect(page.getByText("This item has sold")).toBeVisible();

  await page.goto("/me");
  const order = page.locator("li").filter({ hasText: "Lace" }).first();
  await order.getByRole("button", { name: "Cancel order" }).click();
  await order.getByRole("button", { name: "Yes, cancel order" }).click();
  await expect(order.getByText("Cancelled")).toBeVisible();
  await page.goto("/listing/lace-dress");
  await expect(page.getByRole("button", { name: "Buy now" }).first()).toBeVisible();
});

test("students can report a listing once", async ({ page }) => {
  await signIn(page, "/listing/bucket");
  await page.getByRole("button", { name: "Report this listing" }).click();
  const sheet = page.getByRole("dialog", { name: "Report this listing" });
  await sheet.getByRole("radio", { name: "Duplicate or spam listing" }).click();
  await sheet.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByText("You reported this listing.")).toBeVisible();
});
