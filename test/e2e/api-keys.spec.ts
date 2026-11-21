import { expect, test } from "@playwright/test";
import { openApiKeyForm, openApiKeyMenu } from "../api-key-flow";
import { signIn } from "./sign-in";

// Even fixture keys do not belong in traces or failure screenshots.
test.use({ trace: "off", screenshot: "off", video: "off" });

const MOCK = "http://127.0.0.1:18080";

test.beforeEach(async ({ request }) => {
  await request.post(`${MOCK}/__reset`);
});

// The mock is shared across spec files. Teardown also runs after a failed case.
test.afterEach(async ({ request }) => {
  const reset = await request.post(`${MOCK}/__reset`);
  expect(reset.ok()).toBe(true);
});

/**
 * Plan 07 slice 4 — the management-key surface, on the platform's *other*
 * console namespace (`/api/console/`, not plan 30's `/api/oauth/`).
 */
test("issue a key, see it once, then disable and delete it", async ({
  page,
}) => {
  await signIn(page, "/agents");
  await page.getByRole("button", { name: "Back to all sections" }).click();
  await page.locator('[data-nav-group="Keys"]').click();
  await page.getByRole("link", { name: "API Keys", exact: true }).click();
  await expect(page).toHaveURL(/\/api-keys$/);

  // The seeded rows: one issued by a person, one the control plane manages.
  await expect(page.getByText("ci-deploy")).toBeVisible();
  await expect(page.getByText("historical-unowned")).toBeVisible();

  const form = await openApiKeyForm(page);
  await form.getByLabel("Name").fill("e2e-key");
  await form.getByLabel("Expires").selectOption("7d");
  await form.getByRole("button", { name: "Create key", exact: true }).click();

  // Rendered exactly once, and nowhere else — the whole point of the dialog.
  const revealed = page.getByTestId("revealed-api-key");
  await expect(revealed).toBeVisible();
  const secret = (await revealed.textContent()) ?? "";
  expect(secret.startsWith("sk-map-api01-")).toBe(true);
  await page.getByTestId("close-revealed-api-key").click();
  await expect(revealed).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create key" })).toBeFocused();
  expect((await page.content()).includes(secret)).toBe(false);

  // The list is re-read rather than rendered from the create response.
  const row = page.locator("tr", { hasText: "e2e-key" });
  await expect(row.locator("[data-key-status]")).toHaveAttribute(
    "data-key-status",
    "active",
  );

  let actions = await openApiKeyMenu(page, "e2e-key");
  await actions.getByRole("menuitem", { name: "Disable API key" }).click();
  await expect(row.locator("[data-key-status]")).toHaveAttribute(
    "data-key-status",
    "inactive",
  );

  actions = await openApiKeyMenu(page, "e2e-key");
  await actions.getByRole("menuitem", { name: "Enable API key" }).click();
  await expect(row.locator("[data-key-status]")).toHaveAttribute(
    "data-key-status",
    "active",
  );
  actions = await openApiKeyMenu(page, "e2e-key");
  await actions.getByRole("menuitem", { name: "Delete API key" }).click();
  await expect(page.getByRole("dialog")).toContainText("e2e-key");
  // Cancelling keeps the key and returns to its row.
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(row.locator("[data-key-status]")).toHaveAttribute(
    "data-key-status",
    "active",
  );
  actions = await openApiKeyMenu(page, "e2e-key");
  await actions.getByRole("menuitem", { name: "Delete API key" }).click();
  await page
    .getByRole("button", { name: "Delete API key", exact: true })
    .click();
  await expect(row.locator("[data-key-status]")).toHaveAttribute(
    "data-key-status",
    "archived",
  );
  actions = await openApiKeyMenu(page, "e2e-key");
  await expect(actions.getByRole("menuitem")).toHaveCount(1);
  await expect(
    actions.getByRole("menuitem", { name: "View cost" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.route("**/admin/v1/usage/requests?*", (route) =>
    route.fulfill({
      status: 503,
      json: {
        type: "error",
        error: { type: "api_error", message: "Gateway unavailable" },
      },
    }),
  );
  const unavailable = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/admin/v1/usage/requests" &&
      response.status() === 503,
  );
  await page.reload();
  await unavailable;
  await expect(row.locator("[data-key-status]")).toHaveAttribute(
    "data-key-status",
    "archived",
  );
  await expect(row.getByRole("button", { name: /More actions/ })).toHaveCount(
    0,
  );
});

test("a refused deletion keeps the key and reports the platform error", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/api-keys");
  const row = page.getByRole("row").filter({ hasText: "ci-deploy" });
  await page.route(
    "**/api/console/organizations/default/workspaces/default/api_keys/*",
    async (route) => {
      await route.fulfill({
        status: 400,
        json: {
          type: "error",
          error: {
            type: "invalid_request_error",
            message: "Archived API keys cannot be updated.",
          },
        },
      });
    },
  );
  const actions = await openApiKeyMenu(page, "ci-deploy");
  await actions.getByRole("menuitem", { name: "Delete API key" }).click();
  await page
    .getByRole("button", { name: "Delete API key", exact: true })
    .click();
  await expect(
    page.getByText("Archived API keys cannot be updated."),
  ).toBeVisible();
  await expect(row.locator("[data-key-status]")).toHaveAttribute(
    "data-key-status",
    "active",
  );
  await expect(
    row.getByRole("button", { name: "More actions for ci-deploy" }),
  ).toBeEnabled();
});

// Historical attribution survives, but an unowned key has no authority.
test("an unowned historical key is listed without mutation controls", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/api-keys");
  const row = page.locator("tr", { hasText: "historical-unowned" });
  await expect(row).toBeVisible();
  await expect(row.locator("[data-owner-id]")).toHaveAttribute(
    "data-owner-id",
    "",
  );
  const actions = await openApiKeyMenu(page, "historical-unowned");
  await expect(actions.getByRole("menuitem")).toHaveCount(1);
  await expect(
    actions.getByRole("menuitem", { name: "View cost" }),
  ).toBeVisible();
});

test("find keys, reset the list and inspect the sorted results by keyboard", async ({
  page,
}) => {
  await signIn(page, "/api-keys");
  const count = page.locator("[data-visible-count]");
  const search = page.getByRole("searchbox", { name: "Search keys" });
  await expect(count).toHaveAttribute("data-visible-count", "2");
  await search.fill("ci-deploy");
  await expect(count).toHaveAttribute("data-visible-count", "1");
  await page.getByRole("combobox", { name: "Status", exact: true }).click();
  await page.getByRole("option", { name: "Disabled", exact: true }).click();
  await expect(count).toHaveAttribute("data-visible-count", "0");
  await expect(
    page.getByText("No matching API keys", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reset filters", exact: true })
    .click();
  await expect(search).toHaveValue("");
  await expect(count).toHaveAttribute("data-visible-count", "2");

  const keyHeader = page.getByRole("columnheader", {
    name: "Key",
    exact: true,
  });
  await keyHeader.getByRole("button").click();
  await expect(keyHeader).toHaveAttribute("aria-sort", "ascending");
  await expect(page.locator("tbody tr").first()).toContainText("ci-deploy");
  const opener = page.getByRole("button", { name: "ci-deploy", exact: true });
  await opener.focus();
  await page.keyboard.press("Enter");
  const drawer = page.getByRole("dialog");
  await expect(
    drawer.getByRole("heading", { name: "ci-deploy" }),
  ).toBeVisible();
  await expect(
    drawer.getByRole("button", { name: "Previous", exact: true }),
  ).toBeDisabled();
  await drawer.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    drawer.getByRole("heading", { name: "historical-unowned" }),
  ).toBeVisible();
  await expect(
    drawer.getByRole("button", { name: "Next", exact: true }),
  ).toBeDisabled();
  await drawer.getByRole("button", { name: "Previous", exact: true }).click();
  await page
    .getByRole("button", { name: "historical-unowned", exact: true })
    .click();
  await expect(
    drawer.getByRole("heading", { name: "historical-unowned" }),
  ).toBeVisible();
  await opener.click();
  await expect(
    drawer.getByRole("heading", { name: "ci-deploy" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toHaveCount(0);
  await expect(opener).toBeFocused();
  await keyHeader.getByRole("button").click();
  await expect(keyHeader).toHaveAttribute("aria-sort", "descending");
  await expect(page.locator("tbody tr").first()).toContainText(
    "historical-unowned",
  );
});

test("linked account filters by actor type and the empty search can be reset in place", async ({
  page,
}) => {
  await signIn(page, "/api-keys");
  const count = page.locator("[data-visible-count]");
  const search = page.getByRole("searchbox", { name: "Search keys" });
  await search.fill("missing-fixture-key");
  await expect(count).toHaveAttribute("data-visible-count", "0");
  await page.getByRole("button", { name: "Reset search", exact: true }).click();
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused();
  const account = page.getByRole("combobox", {
    name: "Linked account",
    exact: true,
  });
  for (const [kind, row] of [
    ["Service account", "ci-deploy"],
    ["Not linked", "historical-unowned"],
  ]) {
    await account.click();
    await page.getByRole("option", { name: kind, exact: true }).click();
    await expect(count).toHaveAttribute("data-visible-count", "1");
    await expect(
      page.getByRole("button", { name: row, exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Reset", exact: true }).click();
  }
  await search.fill("ci-deploy");
  await account.click();
  await page
    .getByRole("option", { name: "Service account", exact: true })
    .click();
  await page.getByRole("combobox", { name: "Status", exact: true }).click();
  await page.getByRole("option", { name: "Disabled", exact: true }).click();
  await expect(count).toHaveAttribute("data-visible-count", "0");
  await page
    .getByRole("group", { name: "Status filter", exact: true })
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await expect(search).toHaveValue("ci-deploy");
  await expect(account).toHaveAttribute("data-value", "service_account_actor");
  await expect(count).toHaveAttribute("data-visible-count", "1");
});

test("View cost opens the actual key's UTC month-to-date query and survives reload", async ({
  page,
}) => {
  await signIn(page, "/api-keys");
  const actions = await openApiKeyMenu(page, "ci-deploy");
  const costRequest = page.waitForRequest((request) => {
    const url = new URL(request.url());
    return (
      url.pathname.endsWith("/usage/daily") &&
      url.searchParams.get("api_key_id") === "apikey_ci01"
    );
  });
  await actions.getByRole("menuitem", { name: "View cost" }).click();
  const params = new URL((await costRequest).url()).searchParams;
  expect(params.get("from")).toBe(params.get("to")!.slice(0, 7) + "-01");
  await expect(page).toHaveURL(/\/usage\?/);
  const url = new URL(page.url());
  expect(url.searchParams.get("api_key")).toBe("apikey_ci01");
  expect(url.searchParams.get("range")).toBe("mtd");
  const key = page.getByRole("combobox", { name: "Key", exact: true });
  await expect(key).toHaveValue("apikey_ci01");
  await page.reload();
  await expect(key).toHaveValue("apikey_ci01");
  await page.goBack();
  await expect(page).toHaveURL(/\/api-keys$/);
});

test("expired keys remain inspectable and billable while only deletion is offered", async ({
  page,
}) => {
  await signIn(page, "/api-keys");
  const form = await openApiKeyForm(page);
  await form.getByLabel("Name").fill("expired-fixture");
  await form.getByLabel("Expires").selectOption("custom");
  await form.getByLabel("Custom expiry").fill("2000-01-01T12:00");
  await form.getByRole("button", { name: "Create key", exact: true }).click();
  await page.getByTestId("close-revealed-api-key").click();
  await page.getByRole("combobox", { name: "Status", exact: true }).click();
  await page.getByRole("option", { name: "Expired", exact: true }).click();
  await expect(page.locator("[data-visible-count]")).toHaveAttribute(
    "data-visible-count",
    "1",
  );
  const key = page.getByRole("button", {
    name: "expired-fixture",
    exact: true,
  });
  await key.click();
  const drawer = page.getByRole("dialog", { name: "expired-fixture" });
  await expect(
    drawer.getByRole("button", { name: "Next", exact: true }),
  ).toBeDisabled();
  await drawer
    .getByRole("button", { name: "More actions for expired-fixture" })
    .click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitem")).toHaveCount(2);
  await expect(
    menu.getByRole("menuitem", { name: "Delete API key" }),
  ).toBeVisible();
  await menu.getByRole("menuitem", { name: "View cost" }).click();
  await expect(page).toHaveURL(/\/usage\?/);
  await expect(
    page.getByRole("combobox", { name: "Key", exact: true }),
  ).toHaveValue(/apikey_new/);
});

test("key issuance still works on an edge without CLI authorization", async ({
  page,
}) => {
  await page.route("**/oauth/authorize", (route) =>
    route.fulfill({ status: 404, body: "Not found" }),
  );
  await signIn(page, "/api-keys");
  await Promise.all([
    page.waitForResponse(
      (response) => new URL(response.url()).pathname === "/oauth/authorize",
    ),
    page.getByRole("button", { name: "Create key", exact: true }).click(),
  ]);
  await expect(
    page.getByRole("button", { name: "Your own machine" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Somewhere else" }).click();
  await expect(page.getByRole("textbox", { name: "Name" })).toBeFocused();
});

test("the local-machine path opens CLI instructions and the API-key path resets a cancelled draft", async ({
  page,
}) => {
  await signIn(page, "/api-keys");
  const trigger = page.getByRole("button", { name: "Create key", exact: true });
  await trigger.click();
  await page
    .getByRole("button", { name: "Your own machine", exact: true })
    .click();
  const cli = page.getByRole("dialog", { name: "Your own machine" });
  await expect(
    cli.getByRole("combobox", { name: "Installation method" }),
  ).toBeVisible();
  await expect(
    cli.getByRole("button", { name: "Copy sign-in command" }),
  ).toBeVisible();
  await expect(
    cli.getByText(/ant auth login --profile platform/),
  ).toBeVisible();
  await cli.getByRole("button", { name: "Back", exact: true }).click();
  await page
    .getByRole("button", { name: "Somewhere else", exact: true })
    .click();
  const form = page.getByRole("dialog", { name: "Create API key" });
  await expect(form.getByLabel("Name")).toBeFocused();
  await expect(
    form.getByRole("button", { name: "Create key", exact: true }),
  ).toBeDisabled();
  await form.getByLabel("Name").fill("cancelled");
  await form.getByLabel("Expires").selectOption("custom");
  await expect(form.getByLabel("Custom expiry")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await openApiKeyForm(page);
  await expect(form.getByLabel("Name")).toHaveValue("");
  await expect(form.getByLabel("Expires")).toHaveValue("30d");
});

// The mock's legacy deployment lacks the entire private console namespace.
test("a platform without the console namespace loses the Keys group", async ({
  page,
  request,
}) => {
  await request.post(`${MOCK}/__unimplemented`, {
    data: { surfaces: ["api-keys"] },
  });
  await signIn(page);
  await expect(page.locator('nav [data-nav-group="Keys"]')).toHaveCount(0);
  await expect(page.locator('nav [data-nav-group="Agents"]')).toBeVisible();

  await page.goto("/api-keys");
  const standIn = page.getByTestId("unavailable-surface");
  await expect(standIn).toBeVisible();
  await expect(standIn).toHaveAttribute("data-surface", "api-keys");
});

// A refused key-list read hides
// the entry, but a direct URL must explain the refusal rather than absence.
// This injects a 403 in the password/key lane; it does not resolve an OIDC role.
test("a forbidden key list hides only its entry and explains itself", async ({
  page,
  request,
}) => {
  await request.post(`${MOCK}/__forbid`, {
    data: { paths: ["api/console/organizations/default/workspaces"] },
  });
  await signIn(page);
  await page.goto("/api-keys");

  const state = page.getByTestId("error-state");
  await expect(state).toBeVisible();
  await expect(state).toHaveAttribute("data-error-status", "403");
  await expect(state).toHaveAttribute("data-denied", "true");
  await expect(page.getByTestId("unavailable-surface")).toHaveCount(0);
  await expect(
    page.getByText("this route requires the admin role"),
  ).toBeVisible();
  await expect(page.locator('nav [data-nav-group="Agents"]')).toBeVisible();
  await page.locator('[data-nav-group="Keys"]').click();
  await expect(page).toHaveURL(/\/service-accounts$/);
  await expect(page.locator("nav [data-surface=api-keys]")).toHaveCount(0);
  await expect(
    page.locator("nav [data-surface=service-accounts]"),
  ).toBeVisible();
});

test("Dashboard key shortcut assigns the current user", async ({ page }) => {
  await signIn(page, "/dashboard");
  const form = await openApiKeyForm(page, "Get API key");
  await expect(form.getByLabel("Linked account", { exact: true })).toHaveValue(
    "user_mockadmin01",
  );
  await page.getByLabel("Name", { exact: true }).fill("owned-shortcut");
  const issuance = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api_keys") &&
      response.request().method() === "POST",
  );
  await form.getByRole("button", { name: "Create key", exact: true }).click();
  const response = await issuance;
  expect(response.status()).toBe(200);
  expect(response.request().postDataJSON()).toHaveProperty(
    "principal_id",
    "user_mockadmin01",
  );
  await expect(
    page.getByRole("heading", { name: "Save your API key" }),
  ).toBeVisible();
  await page.getByTestId("close-revealed-api-key").click();
});
