import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18080/__reset");
});

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator("form[data-hydrated]").waitFor();
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/agents$/);
}

/**
 * Axe smoke over the main surfaces, both themes. WCAG A/AA rule tags only —
 * the gate is "no violations", so any regression fails loudly.
 */
async function expectNoViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    results.violations.map((v) => `${v.id}: ${v.nodes.length} nodes`),
  ).toEqual([]);
}

test("agents list passes axe in light and dark themes", async ({ page }) => {
  await signIn(page);
  await expectNoViolations(page);

  await page.getByRole("button", { name: "Dark theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expectNoViolations(page);
});

test("session detail with a pending approval passes axe", async ({ page }) => {
  await signIn(page);
  await page.goto("/sessions/sesn_gatedbash00000000001");
  await expect(page.getByText("Waiting on 1 tool approval")).toBeVisible();
  await expectNoViolations(page);

  // With the event detail panel open.
  await page.getByTestId("event-row").first().click();
  await expect(page.getByTestId("event-detail")).toBeVisible();
  await expectNoViolations(page);

  // And on the Debug tab.
  await page.getByRole("button", { name: "Debug" }).click();
  await expect(page.getByTestId("debug-row").first()).toBeVisible();
  await expectNoViolations(page);
});
