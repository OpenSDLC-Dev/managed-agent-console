import type { Page } from "@playwright/test";

/** The same issuer is available from Keys and the Dashboard. */
export async function openApiKeyForm(
  page: Page,
  trigger: "Create key" | "Get API key" = "Create key",
) {
  await page.getByRole("button", { name: trigger, exact: true }).click();
  await page
    .getByRole("dialog", { name: "Connect to the API" })
    .getByRole("button", { name: "Somewhere else", exact: true })
    .click();
  return page.getByRole("dialog", { name: "Create API key", exact: true });
}

export async function openApiKeyMenu(page: Page, name: string) {
  await page
    .getByRole("row")
    .filter({ has: page.getByRole("button", { name, exact: true }) })
    .getByRole("button", { name: `More actions for ${name}`, exact: true })
    .click();
  return page.getByRole("menu");
}
