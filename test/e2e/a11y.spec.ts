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
  // Name the offending selectors, not just a count: a failure that says
  // "1 nodes" sends the next person to the trace viewer to find out which.
  expect(
    results.violations.map(
      (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`,
    ),
  ).toEqual([]);
}

test("agents list passes axe in light and dark themes", async ({ page }) => {
  await signIn(page);
  await expectNoViolations(page);

  await page.getByRole("button", { name: "Dark theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expectNoViolations(page);
});

/**
 * Waits for a dialog's entry animation to finish before axe measures it.
 * `toBeVisible` resolves the moment the element is painted, which for a
 * fading-in dialog is while it is still translucent — and colour contrast
 * computed against a half-transparent backdrop fails for reasons that have
 * nothing to do with the palette.
 */
async function dialogSettled(page: Page) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect
    .poll(() => dialog.evaluate((el) => getComputedStyle(el).opacity))
    .toBe("1");
}

test("the environment-key surface and its dialogs pass axe", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/environments/env_byoc0000000000000001");
  await expect(
    page.getByRole("heading", { name: "Environment keys" }),
  ).toBeVisible();
  // The table, the setup guide and its code blocks.
  await expectNoViolations(page);

  await page
    .getByRole("button", { name: "Generate environment key", exact: true })
    .click();
  await dialogSettled(page);
  await expectNoViolations(page);

  // The reveal dialog is net-new UI, and the one screen an operator must be
  // able to read and copy from correctly the first time.
  await page.getByLabel("Name").fill("a11y-runner");
  await page
    .getByRole("button", { name: "Create environment key", exact: true })
    .click();
  await expect(page.getByTestId("revealed-key")).toBeVisible();
  await dialogSettled(page);
  await expectNoViolations(page);

  // Deliberately stops here. The next step is the revoke confirm, which is
  // the shared `ConfirmIconButton` — and its destructive button fails colour
  // contrast today on every archive and delete in the console, not only here
  // (issue #90). Asserting `[]` over it would fail for a pre-existing reason
  // in a vendored primitive; asserting a non-empty allowlist would blunt the
  // gate. So the axe pass covers what this slice introduces, and #90 owns the
  // rest.
  await page.getByTestId("close-revealed-key").click();
  await expect(page.getByTestId("revealed-key")).toBeHidden();
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
