import { chromium, type FullConfig } from "@playwright/test";
import { assertLocal, enterEmailedCode, ensureAccount, student, studentState } from "./auth";

/** Signs the test student in once through the real sign-in page and saves the session for the tests. */
export default async function globalSetup(config: FullConfig) {
  assertLocal();
  await ensureAccount(student.email, student.name);

  const baseURL = config.projects[0].use.baseURL!;
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });
  try {
    await page.goto("/sign-in?next=/me");
    await page.locator("html[data-hydrated='true']").waitFor({ state: "attached" });
    await page.getByLabel("Ashesi email").fill(student.email);
    const since = Date.now();
    await page.getByRole("button", { name: "Email me a code" }).click();
    await enterEmailedCode(page, student.email, since);
    await page.waitForURL((url) => url.pathname === "/me");
    await page.context().storageState({ path: studentState });
  } finally {
    await browser.close();
  }
}
