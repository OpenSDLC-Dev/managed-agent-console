import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./sign-in";

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18080/__reset");
});

test("the console follows the system at first paint, on change and after reload", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("theme", "light"));
  await page.emulateMedia({ colorScheme: "dark" });
  await signIn(page, "/workspaces/default/agents");
  const body = page.locator("body");
  await expect(body).toHaveCSS("background-color", "rgb(38, 38, 36)");
  await expect(
    page.getByRole("heading", { name: "Agents", exact: true, level: 1 }),
  ).toBeVisible();
  await page.reload();
  await expect(body).toHaveCSS("background-color", "rgb(38, 38, 36)");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(body).toHaveCSS("background-color", "rgb(252, 252, 251)");
});

test("Ctrl+K searches resources and navigates on Enter", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "platform", {
      configurable: true,
      value: "Win32",
    });
  });
  await signIn(page);
  const trigger = page.getByRole("button", { name: "Search Console… Ctrl K" });
  await expect(trigger).toBeVisible();
  const axe = await new AxeBuilder({ page })
    .include("[data-console-header]")
    .withRules(["label-content-name-mismatch"])
    .analyze();
  expect(axe.violations).toEqual([]);

  await page.keyboard.press("Control+k");
  const input = page.getByRole("combobox", {
    name: "Command palette",
  });
  await expect(input).toBeVisible();

  // Empty query lists the section shortcuts.
  await expect(page.getByRole("option", { name: /Skills/ })).toBeVisible();

  await input.fill("deep resea");
  const hit = page.getByRole("option", { name: /Deep researcher/ });
  await expect(hit).toBeVisible();
  await input.press("Enter");
  await expect(page).toHaveURL(/\/agents\/agent_researcher00000000001$/);
  await expect(input).toBeHidden();

  await trigger.click();
  await expect(input).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(input).toBeHidden();
});

test("a failed archive surfaces the standardized envelope toast", async ({
  page,
}) => {
  await page.route(
    "**/api/organizations/default/proxy/v1/agents/*/archive",
    (route) =>
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

  await signIn(page, "/workspaces/default/agents");
  await page.getByRole("cell", { name: /Deep researcher/ }).click();
  await page
    .getByRole("region", { name: "Agent details" })
    .getByRole("link", { name: "Open", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Deep researcher", level: 1 }),
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
