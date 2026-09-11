import { expect, test } from "@playwright/test";
import { signIn } from "./sign-in";

const DEPLOYMENT = "depl_weeklyresearch000001";

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18080/__reset");
});

test("inspect, pause, resume, run, edit and archive a deployment", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/deployments/${DEPLOYMENT}`);

  await expect(page.getByTestId("deployment-schedule")).toHaveAttribute(
    "data-testid",
    "deployment-schedule",
  );
  await expect(page.locator('[data-upcoming-count="4"]')).toBeVisible();
  await expect(page.locator('[data-run-result="succeeded"]')).toBeVisible();
  await expect(page.locator('[data-run-result="failed"]')).toBeVisible();

  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.locator('[data-status="paused"]')).toBeVisible();
  await expect(page.locator('[data-paused-reason="manual"]')).toBeVisible();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(page.locator('[data-status="active"]')).toBeVisible();

  await page.getByRole("button", { name: "Run now" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/deployments/${DEPLOYMENT}/runs/drun_mock`),
  );
  await expect(page.locator('[data-run-result="succeeded"]')).toBeVisible();
  const sessionLink = page.getByRole("link", { name: /sesn_deploy/ });
  await expect(sessionLink).toBeVisible();

  await page.getByRole("link", { name: DEPLOYMENT }).click();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Name").fill("Weekly platform digest");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("heading", { name: "Weekly platform digest" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await page.getByRole("button", { name: "Archive deployment" }).click();
  await expect(page.locator('[data-status="archived"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Run now" })).toBeHidden();
});

test("create a scheduled deployment with a pinned agent", async ({ page }) => {
  await signIn(page);
  await page.goto("/deployments/new");
  await page.getByLabel("Name").fill("Morning triage");
  await page
    .getByRole("textbox", { name: "Initial message" })
    .fill("Review pending work");
  await page.getByLabel("Agent", { exact: true }).click();
  await page.getByRole("option", { name: /General task agent · v1/ }).click();
  await page.getByLabel("Environment", { exact: true }).click();
  await page.getByRole("option", { name: /byoc-workers/ }).click();
  await page.getByRole("radio", { name: "Schedule", exact: true }).check();
  await page.getByRole("button", { name: "Edit cron" }).click();
  await page.getByLabel("Cron expression").fill("30 8 * * 1-5");
  await page
    .getByRole("combobox", { name: "IANA timezone", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Search timezones" })
    .fill("Shanghai");
  await page.getByRole("option", { name: /Asia\/Shanghai$/ }).click();
  await page.getByRole("button", { name: "Create deployment" }).click();

  await expect(page).toHaveURL(/\/deployments\/depl_mock/);
  await expect(
    page.getByRole("heading", { name: "Morning triage" }),
  ).toBeVisible();
  await expect(page.getByText("30 8 * * 1-5", { exact: true })).toBeVisible();
  await expect(page.getByText(/agent_taskrunner.*v1/)).toBeVisible();
});

test("mock deployment endpoints reject malformed collection and schedule inputs", async ({
  request,
}) => {
  const base = {
    name: "Contract validation",
    agent: {
      type: "agent",
      id: "agent_taskrunner0000000001",
      version: 1,
    },
    environment_id: "env_byoc0000000000000001",
    initial_events: [{ type: "user.message", content: "Run" }],
  };

  const paused = await request.post(
    `http://127.0.0.1:18080/v1/deployments/${DEPLOYMENT}/pause`,
    { headers: { "x-api-key": "test-key" } },
  );
  expect(paused.status()).toBe(200);

  for (const body of [
    { ...base, vault_ids: "vlt_invalid" },
    { ...base, resources: { type: "file" } },
    {
      ...base,
      schedule: { type: "interval", expression: "0 9 * * *" },
    },
  ]) {
    const response = await request.post(
      "http://127.0.0.1:18080/v1/deployments",
      { headers: { "x-api-key": "test-key" }, data: body },
    );
    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      type: "error",
      error: { type: "invalid_request_error" },
    });
  }
});
