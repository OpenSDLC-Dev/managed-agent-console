import { expect, test } from "@playwright/test";
import { signIn } from "./sign-in";

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18080/__reset");
});

test("the console renders in both themes and the choice persists", async ({
  page,
}) => {
  await signIn(page, "/agents");

  // Dark: the reference palette's bg-100 (#262624) on <body>, class on <html>.
  await page.getByRole("button", { name: "Dark theme" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(38, 38, 36)",
  );
  await expect(
    page.getByRole("heading", { name: "Agents", exact: true }),
  ).toBeVisible();

  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);

  // Light: back to the extracted light background (#fcfcfb).
  await page.getByRole("button", { name: "Light theme" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(252, 252, 251)",
  );
});

test("Ctrl+K searches resources and navigates on Enter", async ({ page }) => {
  await signIn(page);

  await page.keyboard.press("Control+k");
  const input = page.getByPlaceholder("Search agents, sessions, environments…");
  await expect(input).toBeVisible();

  // Empty query lists the section shortcuts.
  await expect(page.getByRole("option", { name: /Skills/ })).toBeVisible();

  await input.fill("deep resea");
  const hit = page.getByRole("option", { name: /Deep researcher/ });
  await expect(hit).toBeVisible();
  await input.press("Enter");
  await expect(page).toHaveURL(/\/agents\/agent_researcher00000000001$/);
  await expect(input).toBeHidden();

  // The trigger button in the sidebar opens it too.
  await page.getByRole("button", { name: /Search/ }).click();
  await expect(input).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(input).toBeHidden();
});

test("a failed archive surfaces the standardized envelope toast", async ({
  page,
}) => {
  await page.route("**/api/platform/v1/agents/*/archive", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        type: "error",
        request_id: "req_toast_e2e_1",
        error: {
          type: "invalid_request_error",
          message: "archive refused by test",
        },
      }),
    }),
  );

  await signIn(page, "/agents");
  await page.getByRole("cell", { name: /Deep researcher/ }).click();
  await expect(
    page.getByRole("heading", { name: "Deep researcher" }),
  ).toBeVisible();
  await page
    .getByRole("main")
    .getByRole("button", { name: "More actions" })
    .click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await page.getByRole("button", { name: "Archive agent" }).click();

  await expect(page.getByText("Archive failed")).toBeVisible();
  await expect(
    page.getByText("invalid_request_error: archive refused by test"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copy request-id" }),
  ).toBeVisible();
});
