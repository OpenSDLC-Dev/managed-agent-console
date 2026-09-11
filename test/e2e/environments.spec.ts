import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./sign-in";

const CLOUD = "env_cloudlimited000000001";
const BYOC = "env_byoc0000000000000001";
test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18080/__reset");
});

test("environment inspector preserves the list, history, keyboard focus and API view", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/environments");
  const row = page.getByRole("row").filter({ hasText: "cloud-limited" });
  await row.focus();
  await page.keyboard.press("Enter");
  const panel = page.getByRole("region", { name: "Environment details" });
  await expect(panel).toHaveAttribute("data-environment-id", CLOUD);
  await expect(page).toHaveURL(new RegExp("environment=" + CLOUD));
  await panel.getByText("API", { exact: true }).click();
  await expect(panel.locator("pre")).toContainText('"allowed_hosts"');
  await panel.getByText("Rendered", { exact: true }).click();
  const resize = panel.getByRole("separator", { name: "Resize panel" });
  await resize.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(resize).toHaveAttribute("aria-valuenow", "592");
  await panel.getByRole("button", { name: "Next environment" }).click();
  await expect(panel).toHaveAttribute("data-environment-id", BYOC);
  await page.goBack();
  await expect(panel).toHaveAttribute("data-environment-id", CLOUD);
  await panel.getByRole("button", { name: "Close details" }).focus();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(row).toBeFocused();
  await page
    .getByRole("textbox", { name: "Find environment by ID" })
    .fill("env_missing");
  await page.getByRole("button", { name: "Find", exact: true }).click();
  await expect(panel.getByText(/not found/)).toBeVisible();
  await panel.getByRole("button", { name: "Close details" }).click();
  await page
    .getByRole("textbox", { name: "Find environment by ID" })
    .fill(CLOUD);
  await page.getByRole("button", { name: "Find", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    panel.getByRole("heading", { name: "cloud-limited" }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
  expect(
    await new AxeBuilder({ page })
      .include('[aria-label="Environment details"]')
      .analyze(),
  ).toMatchObject({ violations: [] });
  await panel.getByRole("link", { name: "Open", exact: true }).click();
  await expect(page).toHaveURL("/environments/" + CLOUD);
});

test("environment edits cancel in place and save multiline descriptions", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/environments/" + CLOUD);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Discarded change");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "cloud-limited" }),
  ).toBeVisible();
  await expect(page).toHaveURL("/environments/" + CLOUD);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByLabel("Description", { exact: true })
    .fill("First line\nSecond line");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByText("First line\nSecond line", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("First line\nSecond line", { exact: true }),
  ).toBeVisible();
});

test("environment batch archive confirms, skips archived rows and clears successful selection", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/environments");
  await page.getByRole("checkbox", { name: "Select all rows" }).check();
  await expect(page.locator("[data-selected-count]")).toHaveAttribute(
    "data-selected-count",
    "2",
  );
  await expect(
    page.getByRole("region", { name: "Environment details" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator("[data-selected-count]")).toHaveAttribute(
    "data-selected-count",
    "2",
  );
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await page
    .getByRole("button", { name: "Archive environments", exact: true })
    .click();
  await expect(page.locator("[data-selected-count]")).toHaveAttribute(
    "data-selected-count",
    "0",
  );
  await page.getByRole("combobox", { name: "Status filter" }).click();
  await page.getByRole("option", { name: "All", exact: true }).click();
  await page.getByRole("checkbox", { name: "Select all rows" }).check();
  await expect(
    page.getByRole("button", { name: "Archive", exact: true }),
  ).toBeDisabled();
});

test("environment batch deletion keeps only failures selected and allows retry", async ({
  page,
  request,
}) => {
  const created = await request.post("http://127.0.0.1:18080/v1/environments", {
    headers: { "x-api-key": "test-key" },
    data: { name: "Retry target", config: { type: "self_hosted" } },
  });
  expect(created.ok()).toBe(true);
  const target = await created.json();
  await signIn(page);
  await page.goto("/environments");
  const pattern = "**/api/platform/v1/environments/" + target.id;
  await page.route(pattern, async (route) => {
    if (route.request().method() !== "DELETE") return route.continue();
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        type: "error",
        error: {
          type: "conflict_error",
          message: "Environment is referenced by sessions",
        },
      }),
    });
  });
  await page
    .getByRole("checkbox", { name: "Select Retry target", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Select byoc-workers", exact: true })
    .check();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete environments", exact: true })
    .click();
  await expect(page.locator("[data-selected-count]")).toHaveAttribute(
    "data-selected-count",
    "1",
  );
  await expect(
    page.getByText("Environment is referenced by sessions"),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: "Select Retry target", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("checkbox", { name: "Select Retry target", exact: true })
    .uncheck();
  await expect(
    page.getByText("Environment is referenced by sessions"),
  ).toHaveCount(0);
  await page
    .getByRole("checkbox", { name: "Select Retry target", exact: true })
    .check();
  await expect(
    page.getByText("Environment is referenced by sessions"),
  ).toHaveCount(0);
  await page.unroute(pattern);
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete environments", exact: true })
    .click();
  await expect(page.locator("[data-selected-count]")).toHaveAttribute(
    "data-selected-count",
    "0",
  );
  await expect(
    page.getByText("Environment is referenced by sessions"),
  ).toHaveCount(0);
});

test("deleting an inspected environment restores focus before a delayed list refresh", async ({
  page,
  request,
}) => {
  const created = await request.post("http://127.0.0.1:18080/v1/environments", {
    headers: { "x-api-key": "test-key" },
    data: { name: "Focus target", config: { type: "self_hosted" } },
  });
  expect(created.ok()).toBe(true);
  await signIn(page);
  await page.goto("/environments");
  const row = page.getByRole("row").filter({ hasText: "Focus target" });
  await row.focus();
  await page.keyboard.press("Enter");
  const panel = page.getByRole("region", { name: "Environment details" });
  await expect(
    panel.getByRole("heading", { name: "Focus target" }),
  ).toBeVisible();
  let release!: () => void;
  const refreshed = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/api\/platform\/v1\/environments\?/, async (route) => {
    await refreshed;
    await route.continue();
  });
  await panel.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete environment", exact: true })
    .click();
  try {
    await expect(panel).toHaveCount(0);
    await expect(row).toHaveCount(1);
    await expect(
      page.getByRole("textbox", { name: "Find environment by ID" }),
    ).toBeFocused();
  } finally {
    release();
  }
  await expect(row).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Find environment by ID" }),
  ).toBeFocused();
});

test("environment editor preserves package arguments and metadata through retry, save and cancel", async ({
  page,
  request,
}) => {
  await signIn(page);
  const created = await (
    await request.post("http://127.0.0.1:18080/v1/environments", {
      headers: { "x-api-key": "test-key" },
      data: {
        name: "Row editor",
        config: { type: "cloud" },
        metadata: { Owner: "old" },
      },
    })
  ).json();
  await page.goto("/environments/" + created.id);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Package manager 1").selectOption("pip");
  await page.getByLabel("Package 1", { exact: true }).fill("pkg[a,b]>=1");
  await page.getByRole("button", { name: "Add package", exact: true }).click();
  await page.getByLabel("Package manager 2").selectOption("npm");
  await page.getByLabel("Package 2", { exact: true }).fill(" pkg -e ");
  await page.getByLabel("Metadata key 1").fill("Team");
  await page.getByLabel("Metadata value 1").fill("研发");
  const endpoint = "**/api/platform/v1/environments/" + created.id;
  await page.route(endpoint, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        type: "error",
        error: {
          type: "invalid_request_error",
          message: "Try this environment update again",
        },
      }),
    });
  });
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText(
    "Try this environment update again",
  );
  await expect(page.getByLabel("Package 2", { exact: true })).toHaveValue(
    " pkg -e ",
  );
  await page.unroute(endpoint);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Package 1", { exact: true })).toHaveValue(
    " pkg -e ",
  );
  await expect(page.getByLabel("Package 2", { exact: true })).toHaveValue(
    "pkg[a,b]>=1",
  );
  await expect(page.getByLabel("Metadata key 1")).toHaveValue("Team");
  await expect(page.getByLabel("Metadata value 1")).toHaveValue("研发");
  await page.getByRole("button", { name: "Remove package 2" }).click();
  await expect(page.getByLabel("Package manager 1")).toBeFocused();
  await page.getByRole("button", { name: "Remove metadata row 1" }).click();
  await expect(page.getByLabel("Metadata key 1")).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toBeVisible();
  const saved = await (
    await request.get("http://127.0.0.1:18080/v1/environments/" + created.id, {
      headers: { "x-api-key": "test-key" },
    })
  ).json();
  expect(saved.metadata).toEqual({});
  expect(saved.config.packages).toMatchObject({ npm: [" pkg -e "], pip: [] });
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Discard this draft");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Row editor",
  );
});

test("unrelated environment edits retain stored empty metadata until its row is removed", async ({
  page,
  request,
}) => {
  const headers = { "x-api-key": "test-key" };
  const created = await (
    await request.post("http://127.0.0.1:18080/v1/environments", {
      headers,
      data: {
        name: "Empty metadata",
        config: { type: "cloud" },
        metadata: { empty: "" },
      },
    })
  ).json();
  const endpoint = "http://127.0.0.1:18080/v1/environments/" + created.id;
  await signIn(page, "/environments/" + created.id);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Renamed environment");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toBeVisible();
  expect(
    (await (await request.get(endpoint, { headers })).json()).metadata,
  ).toEqual({ empty: "" });
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Remove metadata row 1" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("button", { name: "Edit", exact: true }),
  ).toBeVisible();
  expect(
    (await (await request.get(endpoint, { headers })).json()).metadata,
  ).toEqual({});
});
