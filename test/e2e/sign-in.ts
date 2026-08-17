import { expect, type Page } from "@playwright/test";

/**
 * Sign in through the password gate the e2e console is configured with
 * (`CONSOLE_PASSWORD` in `playwright.config.ts`).
 *
 * One copy, deliberately. Ten spec files each carried an identical private
 * version of this, every one of them asserting the landing route — so moving
 * that route reddened nine suites that have nothing to do with signing in, and
 * the failure list said nothing about the cause. Changing where a sign-in lands
 * is now a one-line change here.
 *
 * The literal is not imported from `src/lib/routes.ts` on purpose: an e2e test
 * asserting the application's own constant would pass whatever that constant
 * said. This is the value a browser is expected to end up at, written out.
 */
export async function signIn(page: Page, startAt?: string) {
  await page.goto("/login");
  await page.locator("form[data-hydrated]").waitFor();
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  // Where the sign-in lands and where a test needs to start are two different
  // facts, and conflating them is what made moving the landing page redden ten
  // suites at once: every test that wanted the agents list simply signed in and
  // began asserting. A test that needs a particular page now says so.
  if (startAt) await page.goto(startAt);
}
