import { expect, test } from "@playwright/test";
import { signIn } from "./sign-in";

const MOCK = "http://127.0.0.1:18080";

test.beforeEach(async ({ request }) => {
  await request.post(`${MOCK}/__reset`);
});

/**
 * Plan 10 slice 5: Analytics → Usage, the gateway's daily rollups and its
 * per-request ledger, through the `/api/gateway` BFF.
 */
test("read the month's usage, grouped and filtered", async ({ page }) => {
  await signIn(page);
  await page.locator("nav [data-surface=usage]").click();
  await expect(page).toHaveURL(/\/usage$/);

  const requests = page.locator("[data-requests]");
  await expect(requests).not.toHaveAttribute("data-requests", "0");
  const all = Number(await requests.getAttribute("data-requests"));
  await expect(page.getByRole("listitem")).toHaveCount(30);

  await page.getByRole("button", { name: "Key", exact: true }).click();
  await expect(page.locator("table[data-by=api_key_id]")).toBeVisible();
  await expect(page.locator("[data-group=apikey_ci01]")).toContainText(
    "ci-deploy",
  );

  await page
    .getByRole("combobox", { name: "Model" })
    .selectOption("minimax-m3");
  await expect
    .poll(async () => Number(await requests.getAttribute("data-requests")))
    .toBeLessThan(all);
  await expect(page.locator("[data-group]")).toHaveCount(1);
});

test("follow a request to its session, and filter the ledger by one", async ({
  page,
}) => {
  await signIn(page, "/usage");
  await page.getByRole("link", { name: "Requests" }).click();
  await expect(page).toHaveURL(/\/usage\/requests$/);
  const rows = page.locator("[data-status]");
  await expect(rows).toHaveCount(4);
  await expect(
    page.getByRole("link", { name: /sesn_/ }).first(),
  ).toHaveAttribute("href", /^\/sessions\/sesn_/);

  await page.getByLabel("Session ID").fill("sesn_01JA6MOCKGATEWAY000002");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toHaveAttribute("data-status", "502");
});

test("a console without a gateway has no Analytics", async ({
  page,
  request,
}) => {
  await request.post(`${MOCK}/__unimplemented`, {
    data: { surfaces: ["model-gateway"] },
  });
  await signIn(page);
  await expect(page.locator("nav [data-surface=agents]")).toBeVisible();
  await expect(page.locator("[data-nav-group=Analytics]")).toHaveCount(0);
  await page.goto("/usage");
  await expect(page.getByTestId("unavailable-surface")).toHaveAttribute(
    "data-surface",
    "usage",
  );
});
