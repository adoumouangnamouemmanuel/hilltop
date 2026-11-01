import { expect, test } from "@playwright/test";
import { quickSignIn } from "./helpers";

test("seller dashboard shows stats and switches periods", async ({ page }) => {
  await quickSignIn(page, "/dashboard");
  await expect(page.getByRole("heading", { name: "How your listings are doing" })).toBeVisible();
  await expect(page.getByText("Views").first()).toBeVisible();
  const period = page.getByRole("radiogroup", { name: "Period" });
  await period.getByRole("radio", { name: /90/ }).click();
  await expect(period.getByRole("radio", { name: /90/ })).toHaveAttribute("aria-checked", "true");
});
