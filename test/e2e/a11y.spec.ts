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
  await expect(page.getByTestId("environment-keys")).toBeVisible();
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

  await page.getByTestId("close-revealed-key").click();
  await expect(page.getByTestId("revealed-key")).toBeHidden();

  // The revoke confirm, which used to be out of scope: its destructive button
  // failed colour contrast on every archive and delete in the console
  // (issue #90, fixed by splitting the danger token in two).
  await page
    .getByRole("button", { name: /Revoke/ })
    .first()
    .click();
  await dialogSettled(page);
  await expectNoViolations(page);
});

/**
 * The destructive controls, in both themes — the gap #90 lived in.
 *
 * The palette maths is asserted without a browser in `src/app/globals.test.ts`;
 * this is the other half, because only the browser knows what a control's
 * background actually composited to. Dark is not an afterthought here: it
 * failed harder than light, and on bare error text as well as on the tinted
 * button, so every case is walked twice.
 */
for (const theme of ["light", "dark"] as const) {
  test(`destructive controls pass axe in the ${theme} theme`, async ({
    page,
  }) => {
    await signIn(page);
    if (theme === "dark") {
      await page.getByRole("button", { name: "Dark theme" }).click();
      await expect(page.locator("html")).toHaveClass(/dark/);
    }

    // The confirm dialog every ConfirmButton and ConfirmIconButton ends in.
    // Its footer is `bg-muted/50`, a lighter backdrop than the popover and so
    // the console's hardest destructive contrast target.
    await page.goto("/vaults/vlt_github00000000000001");
    await page
      .getByRole("main")
      .getByRole("button", { name: "More actions" })
      .click();
    await page.getByRole("menuitem", { name: "Archive" }).click();
    await dialogSettled(page);
    await expectNoViolations(page);
    // The dialog stays mounted through its own closing fade, and the trigger
    // behind it becomes visible before that ends — so without waiting for the
    // dialog to go, the next scan measures a half-transparent dialog and fails
    // for a reason that is not the palette. The mirror of `dialogSettled`.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();

    // The delete trigger: an outline button carrying bare `text-destructive`.
    await page
      .getByRole("main")
      .getByRole("button", { name: "More actions" })
      .click();
    await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();
    await expectNoViolations(page);

    // Bare `text-destructive` error copy — 36 sites share this colour, and in
    // dark mode it failed on the plain page background, nowhere near a tint.
    await page.goto("/agents/new");
    await page.getByRole("button", { name: /Create agent/ }).click();
    await expect(page.getByText(/required/i).first()).toBeVisible();
    await expectNoViolations(page);

    // The one destructive wash that is not on a console-defined surface: the
    // approval banner's amber. `globals.test.ts` cannot reach this one.
    await page.goto("/sessions/sesn_gatedbash00000000001");
    await expect(page.getByTestId("approval-banner")).toBeVisible();
    await page.getByRole("button", { name: "Deny…" }).first().click();
    await expect(
      page.getByRole("button", { name: "Deny", exact: true }),
    ).toBeVisible();
    await expectNoViolations(page);
  });
}

/**
 * The two controls that render `aria-invalid` (issue #104).
 *
 * Axe does not measure a border's contrast — `globals.test.ts` owns that — but
 * it does check that the state is *named*, and a description pointing at an id
 * that never rendered is the mistake this wiring is most likely to make while
 * looking perfectly correct on screen. The assertions below are the linkage
 * itself; the axe pass is what catches breaking it from the other end.
 */
test("a rejected password marks and names its field", async ({ page }) => {
  await page.goto("/login");
  await page.locator("form[data-hydrated]").waitFor();
  const field = page.getByLabel("Password");
  await expect(field).toHaveAttribute("aria-invalid", "false");

  await field.fill("not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  // By id, not by role: Next mounts its own empty `role="alert"` route
  // announcer on every page, so `getByRole("alert")` is always ambiguous here.
  const message = page.locator("#password-error");
  await expect(message).toHaveText("Wrong password.");
  await expect(message).toHaveAttribute("role", "alert");
  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(field).toHaveAttribute("aria-describedby", "password-error");
  await expectNoViolations(page);

  // Typing retracts the verdict, so the field does not stay announced invalid
  // while it is being corrected.
  await field.fill("t");
  await expect(field).toHaveAttribute("aria-invalid", "false");
});

test("an unparseable raw agent config marks and names its textarea", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/agents/new");
  await page.getByRole("button", { name: "raw" }).click();
  const field = page.getByLabel("Raw agent config");
  await field.fill("not json");
  await page.getByRole("button", { name: "rendered" }).click();

  await expect(field).toHaveAttribute("aria-invalid", "true");
  await expect(field).toHaveAttribute("aria-describedby", "raw-config-error");
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
