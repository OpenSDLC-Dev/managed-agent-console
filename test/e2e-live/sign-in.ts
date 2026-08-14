import { expect, type Page } from "@playwright/test";
import { LIVE_CONSOLE_PASSWORD } from "./env";

/**
 * Signs in through the console's own password gate — the deployment protection
 * of CLAUDE.md principle 5, not a user system. Shared by the tier's specs so
 * the gate is spelled once.
 */
export async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator("form[data-hydrated]").waitFor();
  await page.getByLabel("Password").fill(LIVE_CONSOLE_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/agents$/);
}
