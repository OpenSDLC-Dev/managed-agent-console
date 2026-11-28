import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { settleMotion } from "./settle-motion";
import { signIn } from "./sign-in";
const MOCK = "http://127.0.0.1:18080";
test.beforeEach(async ({ request }) => {
  await request.post(MOCK + "/__reset");
});

test("batch archive keeps failed sessions selected and retries only those rows", async ({
  page,
  request,
}) => {
  const created = await request.post(MOCK + "/v1/sessions", {
    headers: {
      "x-api-key": "sk-map-api01-mock-owned-test-key-00000000000000000000001",
    },
    data: {
      agent: "agent_taskrunner0000000001",
      environment_id: "env_egress000000000000001",
      title: "Batch retry session",
    },
  });
  expect(created.ok()).toBe(true);
  const { id } = await created.json();
  const gated = "sesn_gatedbash00000000001";
  await signIn(page, "/workspaces/default/sessions?status=all");
  await page.getByLabel("Select " + gated, { exact: true }).check();
  await page.getByLabel("Select " + id, { exact: true }).check();
  const archive = page.getByRole("button", { name: "Archive", exact: true });
  await page.route(
    "**/proxy/v1/sessions/" + id + "/archive",
    (route) =>
      route.fulfill({
        status: 409,
        json: {
          error: {
            type: "conflict_error",
            message: "Session changed while archiving",
          },
        },
      }),
    { times: 1 },
  );
  await archive.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading")).toHaveText("Archive 2 sessions?");
  await dialog.getByRole("button", { name: "Archive sessions" }).click();
  await expect(page.getByText("Session changed while archiving")).toBeVisible();
  await expect(
    page.getByLabel("Select " + gated, { exact: true }),
  ).not.toBeChecked();
  await expect(page.getByLabel("Select " + id, { exact: true })).toBeChecked();
  await archive.click();
  await expect(dialog.getByRole("heading")).toHaveText("Archive 1 session?");
  await dialog.getByRole("button", { name: "Archive sessions" }).click();
  await expect(
    page.getByLabel("Select " + id, { exact: true }),
  ).not.toBeChecked();
  await expect(page.getByText("Session changed while archiving")).toHaveCount(
    0,
  );
});

test("changing list scope with Back dismisses an unsubmitted selection confirmation", async ({
  page,
}) => {
  const id = "sesn_gatedbash00000000001";
  await signIn(page, "/workspaces/default/sessions?status=all");
  await page.getByRole("textbox", { name: "Find session by ID" }).fill(id);
  await expect(page).toHaveURL(new RegExp("id=" + id));
  await page.getByLabel("Select " + id, { exact: true }).check();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Delete 1 session?" }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL("/workspaces/default/sessions?status=all");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByLabel("Select " + id, { exact: true }),
  ).not.toBeChecked();
});

test("All includes archived sessions and restores the exact result page through history and reload", async ({
  page,
  request,
}) => {
  const archived = await request.post(
    MOCK + "/v1/sessions/sesn_gatedbash00000000001/archive",
    {
      headers: {
        "x-api-key": "sk-map-api01-mock-owned-test-key-00000000000000000000001",
      },
      data: {},
    },
  );
  expect(archived.ok()).toBe(true);
  await page.route("**/proxy/v1/sessions?*", async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set("limit", "1");
    await route.fulfill({ response: await route.fetch({ url: url.href }) });
  });
  const list = "/workspaces/default/sessions?status=all&order=asc&created=all";
  const first = page
    .getByRole("row")
    .filter({ hasText: "Install deps and run tests" });
  const second = page
    .getByRole("row")
    .filter({ hasText: "Survey agent frameworks" });
  await signIn(page, list);
  await expect(first).toBeVisible();
  await expect(first.getByText("terminated", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(second).toBeVisible();
  const paged = new URL(page.url());
  expect(paged.searchParams.get("page")).toBeTruthy();
  await page.reload();
  await expect(second).toBeVisible();
  await page.goBack();
  await expect(first).toBeVisible();
  await page.goForward();
  await expect(second).toBeVisible();
  await page.goto(paged.href);
  await expect(second).toBeVisible();

  // Applying the same filter must not discard the cursor. A changed filter
  // and its cursor reset share one history entry.
  await page.getByLabel("Created filter").click();
  await page.getByRole("button", { name: "Custom range" }).click();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page).toHaveURL(paged.href);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page).toHaveURL("/workspaces/default/sessions");
  await expect(second).toBeVisible();
  await expect(first).toHaveCount(0);
  await page.goBack();
  await expect(page).toHaveURL(paged.href);
  await expect(second).toBeVisible();
  await page.getByRole("button", { name: "Previous page" }).click();
  await expect(first).toBeVisible();
});

test("deployment filtering reaches archived options and exact lookup escapes a filter", async ({
  page,
  request,
}) => {
  const runResponse = await request.post(
    MOCK + "/v1/deployments/depl_weekresearch00000001/run",
    {
      headers: {
        "x-api-key": "sk-map-api01-mock-owned-test-key-00000000000000000000001",
      },
      data: {},
    },
  );
  expect(runResponse.ok()).toBe(true);
  const run = await runResponse.json();
  await request.post(
    MOCK + "/v1/deployments/depl_weekresearch00000001/archive",
    {
      headers: {
        "x-api-key": "sk-map-api01-mock-owned-test-key-00000000000000000000001",
      },
      data: {},
    },
  );
  await signIn(page, "/workspaces/default/sessions");
  await page.getByRole("combobox", { name: "Deployment filter" }).click();
  const filtered = page.waitForRequest(
    (r) =>
      new URL(r.url()).searchParams.get("deployment_id") ===
      "depl_weekresearch00000001",
  );
  await page
    .getByRole("option", { name: /Weekly research digest.*archived/ })
    .click();
  expect(new URL((await filtered).url()).searchParams.has("page")).toBe(false);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page
    .getByRole("textbox", { name: "Find session by ID" })
    .fill("sesn_research0000000000001");
  await expect(
    page.getByRole("link", { name: "Survey agent frameworks" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Quickview" }).click();
  await expect(page).toHaveURL(/session=sesn_research0000000000001/);
  await page.goBack();
  await page
    .getByRole("textbox", { name: "Find session by ID" })
    .fill(run.session_id);
  await expect(page.locator("tbody [data-id]")).toHaveAttribute(
    "data-id",
    run.session_id,
  );
  await expect(page).toHaveURL(new RegExp("id=" + run.session_id + "$"));
});

test("status multi-select defaults to active and Created sorts on the server", async ({
  page,
}) => {
  await signIn(page, "/workspaces/default/sessions");
  await expect(
    page.getByRole("combobox", { name: "Status filter" }),
  ).toHaveAttribute("data-value", "running,idle,rescheduling");
  await page.getByRole("combobox", { name: "Status filter" }).click();
  const changed = page.waitForRequest(
    (r) =>
      r.url().includes("/v1/sessions?") &&
      new URL(r.url()).searchParams.getAll("statuses").includes("terminated"),
  );
  await page.getByRole("option", { name: "Terminated", exact: true }).click();
  const params = new URL((await changed).url()).searchParams;
  expect(params.getAll("statuses").sort()).toEqual([
    "idle",
    "rescheduling",
    "running",
    "terminated",
  ]);
  expect(params.get("include_archived")).toBe("true");
  await expect(page).toHaveURL(/status=all$/);
  await page.getByRole("button", { name: "Clear selection" }).click();
  await expect(page.getByLabel("Status filter")).toHaveAttribute(
    "data-value",
    "running,idle,rescheduling",
  );
  await page.keyboard.press("Escape");
  const sorted = page.waitForRequest(
    (r) => new URL(r.url()).searchParams.get("order") === "asc",
  );
  await page.getByRole("button", { name: "Created: newest first" }).click();
  expect(new URL((await sorted).url()).searchParams.has("page")).toBe(false);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
  await settleMotion(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const rejected = page.waitForResponse(
    (r) => r.url().includes("sesn_missing") && r.status() === 404,
  );
  await page
    .getByRole("textbox", { name: "Find session by ID" })
    .fill("sesn_missing?limit=100");
  const refusal = await rejected;
  expect(new URL(refusal.url()).search).toBe("");
  expect(new URL(refusal.url()).pathname).toContain(
    "sesn_missing%3Flimit%3D100",
  );
  expect(await refusal.json()).toMatchObject({
    error: { type: "not_found_error" },
  });
});
