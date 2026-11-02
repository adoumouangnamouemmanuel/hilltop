import { expect, test } from "@playwright/test";
import { openPanel, signIn } from "./helpers";

// Two real students: Esi buys, Kofi sells his smartwatch. Realtime isn't running in
// the tests, so each side reloads to see what the other did.
test("a buyer offers and messages; the seller accepts and replies", async ({ browser }) => {
  const buyer = await (await browser.newContext()).newPage();
  const seller = await (await browser.newContext()).newPage();

  await signIn(buyer, "/listing/my-smartwatch", "buyer");
  await openPanel(buyer, "Make offer", buyer.getByLabel("Your offer in cedis"));
  await buyer.getByLabel("Your offer in cedis").fill("340");
  await buyer.getByRole("button", { name: "Send", exact: true }).click();
  await expect(buyer.getByText(/Offer of GH₵340 sent/).first()).toBeVisible();

  await openPanel(buyer, "Message", buyer.getByLabel("Message to Kofi Darko"));
  const note = `Can we meet at the library? ${Date.now()}`;
  await buyer.getByLabel("Message to Kofi Darko").fill(note);
  await buyer.getByRole("button", { name: "Send message" }).click();
  await expect(buyer.getByText("Message sent").first()).toBeVisible();

  // Kofi sees the offer on his listing and accepts it.
  await signIn(seller, "/listing/my-smartwatch");
  const offer = seller.locator("li").filter({ hasText: "GH₵340 from Esi" }).first();
  await offer.getByRole("button", { name: "Accept" }).click();
  await expect(offer.getByText("Accepted")).toBeVisible();

  // He replies from his inbox.
  await seller.goto("/inbox");
  await seller
    .getByRole("button", { name: /Esi Mensah/ })
    .first()
    .click();
  await expect(seller.getByText(note).last()).toBeVisible();
  await seller.getByLabel("Message Esi Mensah").fill("Yes, 4pm works.");
  await seller.getByRole("button", { name: "Send", exact: true }).click();
  await expect(seller.getByText("Yes, 4pm works.").last()).toBeVisible();

  // Esi is notified of both.
  await buyer.goto("/notifications");
  await expect(buyer.getByText("Offer accepted").first()).toBeVisible();
  await expect(buyer.getByText("Yes, 4pm works.").first()).toBeVisible();
  await buyer.goto("/listing/my-smartwatch");
  await expect(buyer.getByText(/GH₵340/).first()).toBeVisible();

  // Kofi corrects his reply, then deletes it; Esi sees both.
  await seller.getByRole("button", { name: "Message options" }).last().click();
  await seller.getByRole("button", { name: "Edit message" }).click();
  await seller.getByLabel("Message Esi Mensah").fill("Yes, 5pm works.");
  await seller.getByRole("button", { name: "Send", exact: true }).click();
  await expect(seller.getByText("Yes, 5pm works.").last()).toBeVisible();

  await buyer.goto("/inbox");
  await buyer
    .getByRole("button", { name: /Kofi Darko/ })
    .first()
    .click();
  await expect(buyer.getByText("Yes, 5pm works.").last()).toBeVisible();
  await expect(buyer.getByText(/edited/).last()).toBeVisible();

  await seller.getByRole("button", { name: "Message options" }).last().click();
  await seller.getByRole("button", { name: "Delete message" }).click();
  await seller.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(seller.getByText("This message was deleted").last()).toBeVisible();
  await buyer.reload();
  await buyer
    .getByRole("button", { name: /Kofi Darko/ })
    .first()
    .click();
  await expect(buyer.getByText("This message was deleted").last()).toBeVisible();
});

// Two students share one chat: asking the same seller about a second item continues
// it, and the thread shows which item each part of the conversation is about.
test("messaging the same seller about two items keeps one chat with both items", async ({ page }) => {
  for (const [id, text] of [
    ["my-desk-lamp", `Does the lamp still work? ${Date.now()}`],
    ["my-desk-fan", `And is the fan quiet? ${Date.now()}`],
  ]) {
    await signIn(page, `/listing/${id}`, "buyer");
    await openPanel(page, "Message", page.getByLabel("Message to Kofi Darko"));
    await page.getByLabel("Message to Kofi Darko").fill(text);
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("Message sent").first()).toBeVisible();
  }

  await page.goto("/inbox");
  await expect(page.getByRole("button", { name: /Kofi Darko/ })).toHaveCount(1);
  await page.getByRole("button", { name: /Kofi Darko/ }).click();
  await expect(page.getByRole("link", { name: /Adjustable desk lamp/ }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Rechargeable desk fan/ }).first()).toBeVisible();
  await expect(page.getByText(/Does the lamp still work\?/).last()).toBeVisible();
  await expect(page.getByText(/And is the fan quiet\?/).last()).toBeVisible();
});
