import { chromium, type FullConfig } from "@playwright/test";
import { assertLocal, clearMailbox, enterEmailedCode, ensureAccount, stateFile, students, type Who } from "./auth";

/** Signs each test student in once through the real sign-in page and saves their session for the tests. */
export default async function globalSetup(config: FullConfig) {
  assertLocal();
  await clearMailbox();
  const baseURL = config.projects[0].use.baseURL!;
  const browser = await chromium.launch();
  try {
    for (const who of Object.keys(students) as Who[]) {
      const { email, name } = students[who];
      await ensureAccount(email, name);
      // Supabase allows one email per address per second; creating the account just sent one.
      await new Promise((r) => setTimeout(r, 2000));

      const page = await browser.newPage({ baseURL });
      await page.goto("/sign-in?next=/me");
      await page.locator("html[data-hydrated='true']").waitFor({ state: "attached" });
      await page.getByLabel("Ashesi email").fill(email);
      const since = Date.now();
      await page.getByRole("button", { name: "Email me a code" }).click();
      // Fail with what the page said, not just a missing code field. Next.js has an
      // empty route announcer with the same role, so only alerts with text count.
      const alert = page.getByRole("alert").filter({ hasText: /\w/ });
      const quiet = (p: Promise<void>) => p.catch(() => {});
      await Promise.race([quiet(page.getByLabel("Digit 1").waitFor()), quiet(alert.waitFor())]);
      if (await alert.isVisible()) throw new Error(`Sign-in page said: ${await alert.innerText()}`);
      await enterEmailedCode(page, email, since);
      await page.waitForURL((url) => url.pathname === "/me");
      await page.context().storageState({ path: stateFile(who) });
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
