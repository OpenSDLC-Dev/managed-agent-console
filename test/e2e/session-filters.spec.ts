import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./sign-in";
const MOCK = "http://127.0.0.1:18080";
test.beforeEach(async ({ request }) => {
  await request.post(MOCK + "/__reset");
});

test("deployment filtering reaches archived options and exact lookup escapes a filter", async ({
  page,
  request,
}) => {
  const runResponse = await request.post(
    MOCK + "/v1/deployments/depl_weeklyresearch000001/run",
    { headers: { "x-api-key": "test-key" }, data: {} },
  );
  expect(runResponse.ok()).toBe(true);
  const run = await runResponse.json();
  await request.post(
    MOCK + "/v1/deployments/depl_weeklyresearch000001/archive",
    { headers: { "x-api-key": "test-key" }, data: {} },
  );
  await signIn(page, "/sessions");
  await page.getByRole("combobox", { name: "Deployment filter" }).click();
  const filtered = page.waitForRequest(
    (r) =>
      new URL(r.url()).searchParams.get("deployment_id") ===
      "depl_weeklyresearch000001",
  );
  await page
    .getByRole("option", { name: /Weekly research digest.*archived/ })
    .click();
  expect(new URL((await filtered).url()).searchParams.has("page")).toBe(false);
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page
    .getByRole("textbox", { name: "Find session by ID" })
    .fill("sesn_research0000000000001");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page).toHaveURL(/session=sesn_research0000000000001/);
  await page.goBack();
  await page
    .getByRole("textbox", { name: "Find session by ID" })
    .fill(run.session_id);
  await page
    .getByRole("textbox", { name: "Find session by ID" })
    .press("Enter");
  await expect(page).toHaveURL(new RegExp("session=" + run.session_id + "$"));
});

test("status multi-select defaults to active and Created sorts on the server", async ({
  page,
}) => {
  await signIn(page, "/sessions");
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
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page
    .getByRole("textbox", { name: "Find session by ID" })
    .fill("sesn_missing?limit=100");
  const rejected = page.waitForResponse(
    (r) => r.url().includes("sesn_missing") && r.status() === 404,
  );
  await page.getByRole("button", { name: "Open", exact: true }).click();
  expect(await (await rejected).json()).toMatchObject({
    error: { type: "invalid_request_error" },
  });
});
