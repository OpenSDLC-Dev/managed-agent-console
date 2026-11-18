import { expect, type Page } from "@playwright/test";
import { resolveLiveEnv } from "./env";

/** Signs in through the real platform named password account. */
export async function signIn(page: Page): Promise<void> {
  const { loginName, loginPassword } = resolveLiveEnv();
  await page.goto("/login");
  await page.locator("form[data-hydrated]").waitFor();
  await page.getByLabel("Login name").fill(loginName);
  await page.getByLabel("Password").fill(loginPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}
