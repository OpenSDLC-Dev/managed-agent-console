import { expect, type Page } from "@playwright/test";

/** Sign in through the platform-owned named password account. */
export async function signIn(page: Page, startAt?: string) {
  await page.goto("/login");
  await page.locator("form[data-hydrated]").waitFor();
  await page.getByLabel("Login name").fill("operator");
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  // Where the sign-in lands and where a test needs to start are two different
  // facts, and conflating them is what made moving the landing page redden ten
  // suites at once: every test that wanted the agents list simply signed in and
  // began asserting. A test that needs a particular page now says so.
  if (startAt) await page.goto(startAt);
}
