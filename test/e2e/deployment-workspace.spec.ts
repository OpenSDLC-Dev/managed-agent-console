import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./sign-in";

const ID = "depl_weeklyresearch000001";
const PATH = "/deployments/" + ID;
const FAILED = "drun_failed000000000001";
test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18080/__reset");
});

test("configuration retains drafts across tabs and lifecycle refresh, saves a pinned version and guards navigation", async ({
  page,
}) => {
  await signIn(page, PATH);
  const name = page.getByLabel("Name", { exact: true });
  await expect(name).toHaveValue("Weekly research digest");
  await name.fill("Unsaved deployment");
  await page.getByRole("button", { name: "Runs", exact: true }).click();
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Resume", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Configuration", exact: true })
    .click();
  await expect(name).toHaveValue("Unsaved deployment");
  await page
    .getByRole("link", { name: "Deployments", exact: true })
    .first()
    .click();
  await page
    .getByRole("dialog", { name: "Unsaved changes" })
    .getByRole("button", { name: "Stay" })
    .click();
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(name).toHaveValue("Weekly research digest");
  await page
    .getByRole("combobox", { name: "Agent version", exact: true })
    .click();
  await page.getByRole("option", { name: "v2", exact: true }).click();
  await name.fill("Saved deployment");
  const post = page.waitForRequest(
    (req) =>
      req.method() === "POST" && req.url().endsWith("/v1/deployments/" + ID),
  );
  await page.getByRole("button", { name: "Save changes" }).click();
  const body = (await post).postDataJSON();
  expect(body.agent.version).toBe(2);
  expect(body).not.toHaveProperty("resources");
  await expect(page.getByRole("button", { name: "Save changes" })).toBeHidden();
  await page.reload();
  await expect(name).toHaveValue("Saved deployment");
  await expect(
    page.getByRole("combobox", { name: "Agent version", exact: true }),
  ).toContainText("v2");
});

test("Agent version paging retains its selection after an error and retries from the popup footer", async ({
  page,
}) => {
  let versions: unknown[] = [];
  let allowOlder = false;
  await page.route(
    "**/api/platform/v1/agents/agent_researcher00000000001/versions?*",
    async (route) => {
      if (!new URL(route.request().url()).searchParams.has("page")) {
        const response = await route.fetch();
        const body = await response.json();
        versions = body.data;
        await route.fulfill({
          json: { ...body, data: versions.slice(0, 1), next_page: "older" },
        });
      } else if (!allowOlder) {
        await route.fulfill({
          status: 503,
          json: {
            type: "error",
            error: { type: "api_error", message: "Version page unavailable" },
          },
        });
      } else {
        await route.fulfill({
          json: { data: versions.slice(1), next_page: null },
        });
      }
    },
  );
  await signIn(page, PATH);
  const version = page.getByRole("combobox", {
    name: "Agent version",
    exact: true,
  });
  await version.click();
  const older = page.getByRole("button", { name: "Load older versions" });
  await older.click();
  await expect(page.getByTestId("error-state")).toContainText(
    "Version page unavailable",
  );
  await expect(version).toContainText("v3");
  await expect(older).toBeEnabled();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  allowOlder = true;
  await older.focus();
  await older.press("Enter");
  await page.getByRole("option", { name: "v2", exact: true }).click();
  await expect(version).toContainText("v2");
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(version).toContainText("v3");
});

test("resource edits submit full replacements and a failed save retains the draft", async ({
  page,
}) => {
  await signIn(page, PATH);
  await expect(page.getByLabel("File ID", { exact: true })).toHaveValue(
    "file_notes0000000000001",
  );
  await page.getByLabel("Access", { exact: true }).selectOption("read_only");
  await page
    .getByLabel("Memory instructions (optional)")
    .fill("Keep this draft");
  await page.route("**/api/platform/v1/deployments/" + ID, async (route) => {
    if (route.request().method() === "POST")
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          type: "error",
          error: {
            type: "invalid_request_error",
            message: "Resource rejected",
          },
        }),
      });
    else await route.continue();
  });
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator("form").getByRole("alert")).toContainText(
    "Resource rejected",
  );
  await expect(page.getByLabel("Memory instructions (optional)")).toHaveValue(
    "Keep this draft",
  );
  await page.unroute("**/api/platform/v1/deployments/" + ID);
  const post = page.waitForRequest(
    (req) =>
      req.method() === "POST" && req.url().endsWith("/v1/deployments/" + ID),
  );
  await page.getByRole("button", { name: "Save changes" }).click();
  expect((await post).postDataJSON().resources).toEqual([
    { type: "file", file_id: "file_notes0000000000001" },
    {
      type: "memory_store",
      memory_store_id: "memstore_projectnotes000001",
      access: "read_only",
      instructions: "Keep this draft",
    },
  ]);
  await expect(page.getByRole("button", { name: "Save changes" })).toBeHidden();
});

test("run inspection retains filters and history, handles missing Sessions and remains accessible at narrow widths", async ({
  page,
}) => {
  await signIn(page, PATH + "?tab=runs&run=" + FAILED);
  let pane = page.getByRole("region", { name: "Deployment run details" });
  await expect(pane.getByTestId("deployment-run-error")).toBeVisible();
  await page.reload();
  await expect(pane).toHaveAttribute("data-deployment-run-id", FAILED);
  await pane.getByRole("button", { name: "Close details" }).click();
  await page.getByRole("combobox", { name: "Result filter" }).click();
  const filtered = page.waitForRequest(
    (req) =>
      req.url().includes("/v1/deployment_runs?") &&
      req.url().includes("has_error=false"),
  );
  await page.getByRole("option", { name: "Succeeded", exact: true }).click();
  expect(
    new URL((await filtered).url()).searchParams.get("deployment_id"),
  ).toBe(ID);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.locator("tbody tr").click();
  pane = page.getByRole("region", { name: "Deployment run details" });
  await expect(pane.locator('[data-run-result="succeeded"]')).toBeVisible();
  await pane.getByText("Run API response", { exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const raw = pane.locator("pre");
  await raw.focus();
  await raw.press("ArrowRight");
  await expect
    .poll(() => raw.evaluate((node) => node.scrollLeft))
    .toBeGreaterThan(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await pane.getByRole("button", { name: "Close details" }).click();
  await page.goBack();
  await expect(pane).toBeVisible();
  await pane.press("Escape");
  await page.getByLabel("Find run by ID").fill("drun_missing");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.getByTestId("error-state")).toHaveAttribute(
    "data-error-status",
    "404",
  );
});

test("run pagination survives selection and closes without changing the cursor", async ({
  page,
  request,
}) => {
  for (let index = 0; index < 21; index++)
    expect(
      (
        await request.post(`http://127.0.0.1:18080/v1/deployments/${ID}/run`, {
          headers: { "x-api-key": "test-key" },
        })
      ).ok(),
    ).toBe(true);
  await signIn(page, PATH + "?tab=runs");
  await expect(page.locator("tbody tr")).toHaveCount(20);
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(3);
  const run = await page
    .locator("tbody tr")
    .first()
    .getByTestId("id-cell")
    .first()
    .getAttribute("data-id");
  await page.locator("tbody tr").first().click();
  await expect(page).toHaveURL(new RegExp("run=" + run));
  await page.getByRole("button", { name: "Close details" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Previous page" }),
  ).toBeEnabled();
});

test("narrow configuration keeps its save bar visible and archived values remain read-only", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, PATH);
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Weekly research digest",
  );
  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight),
    ).toBeLessThanOrEqual(844);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
  await page
    .getByRole("textbox", { name: "Initial message", exact: true })
    .fill("Visible save bar");
  const save = page.getByRole("button", { name: "Save changes" });
  const bounds = await save.boundingBox();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  expect(
    (
      await page.request.post(`/api/platform/v1/deployments/${ID}/archive`)
    ).ok(),
  ).toBe(true);
  await page.reload();
  await expect(page.getByLabel("Name", { exact: true })).toBeDisabled();
  await expect(save).toBeHidden();
  const configuration = page.getByRole("region", {
    name: "Deployment configuration",
    exact: true,
  });
  await page.getByRole("button", { name: "Runs", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(configuration).toBeFocused();
  await configuration.press("ArrowDown");
  await expect
    .poll(() => configuration.evaluate((node) => node.scrollTop))
    .toBeGreaterThan(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
