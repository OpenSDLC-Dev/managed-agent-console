import type { Page } from "@playwright/test";

/**
 * Picks one of the mock gateway's chat models in the agent or Dream model
 * field. With a gateway, that field is a select of its models (plan 10
 * decision 6), and a form waits for a listed choice before it saves.
 */
export async function chooseModel(page: Page, name = "agent-default") {
  // The field is a text box until the gateway's list arrives.
  await page.getByRole("combobox", { name: "Model", exact: true }).click();
  await page.getByRole("option", { name, exact: true }).click();
}
