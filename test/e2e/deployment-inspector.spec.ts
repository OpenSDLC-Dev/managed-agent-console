import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./sign-in";
const DEPLOYMENT = "depl_weeklyresearch000001";
const MOCK = "http://127.0.0.1:18080";
test.beforeEach(async ({ request }) => {
  expect((await request.post(MOCK + "/__reset")).ok()).toBe(true);
});

test("Deployment selection preserves list history and opens the full page explicitly", async ({
  page,
}) => {
  await signIn(page, "/deployments");
  await expect(
    page.getByRole("cell", { name: "Weekly research digest", exact: true }),
  ).toBeVisible();
  const first = page.locator("tbody tr").first().getByRole("cell").nth(1);
  const name = await first.innerText();
  await first.click();
  const panel = page.getByRole("region", { name: "Deployment details" });
  await expect(panel.getByRole("heading", { name, exact: true })).toBeVisible();
  const selectedUrl = page.url();
  await panel.getByRole("button", { name: "API", exact: true }).click();
  await expect(panel.locator("pre")).toContainText('"initial_events"');
  await panel.getByRole("button", { name: "Next deployment" }).click();
  await expect(page).not.toHaveURL(selectedUrl);
  await page.goBack();
  await expect(page).toHaveURL(selectedUrl);
  await page.reload();
  await expect(panel.getByRole("heading", { name, exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "Close details" }).click();
  await expect(page).toHaveURL("/deployments");
  await expect(page.getByLabel("Find deployment by ID")).toBeFocused();
  await page.getByLabel("Find deployment by ID").fill(DEPLOYMENT);
  await page.getByLabel("Find deployment by ID").press("Enter");
  await expect(
    panel.getByRole("link", { name: /Deep researcher/ }),
  ).toHaveAttribute("href", "/agents/agent_researcher00000000001?version=3");
  await panel.getByRole("link", { name: "Open", exact: true }).click();
  await expect(page).toHaveURL("/deployments/" + DEPLOYMENT);
  await page.goBack();
  await panel.getByRole("button", { name: "Close details" }).click();
  const rowOpen = page
    .getByRole("row")
    .filter({ hasText: "Weekly research digest" })
    .getByRole("link", { name: "Open", exact: true });
  await rowOpen.click();
  await expect(page).toHaveURL("/deployments/" + DEPLOYMENT);
  await page.goBack();
  await expect(panel).toHaveCount(0);
  await rowOpen.focus();
  await rowOpen.press("Enter");
  await expect(page).toHaveURL("/deployments/" + DEPLOYMENT);
});

test("lookup errors, resize and narrow resources remain accessible", async ({
  page,
}) => {
  await signIn(page, "/deployments?deployment=" + DEPLOYMENT);
  const panel = page.getByRole("region", { name: "Deployment details" });
  await expect(
    panel.getByRole("heading", { name: "Weekly research digest" }),
  ).toBeVisible();
  const resize = panel.getByRole("separator", { name: "Resize panel" });
  await resize.focus();
  await resize.press("ArrowLeft");
  await expect(resize).toHaveAttribute("aria-valuenow", "592");
  await page.setViewportSize({ width: 390, height: 844 });
  await panel
    .getByRole("link", { name: "Project notes", exact: true })
    .scrollIntoViewIfNeeded();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await panel
    .getByRole("button", { name: "Rendered", exact: true })
    .press("Escape");
  await expect(page.getByLabel("Find deployment by ID")).toBeFocused();
  await page.getByLabel("Find deployment by ID").fill("depl_missing");
  await page.getByLabel("Find deployment by ID").press("Enter");
  await expect(panel.getByTestId("error-state")).toBeVisible();
  await expect(page).toHaveURL("/deployments?deployment=depl_missing");
});

test("opening and closing a Deployment on page two retains the server cursor", async ({
  page,
  request,
}) => {
  for (let index = 0; index < 21; index++) {
    const created = await request.post(MOCK + "/v1/deployments", {
      headers: { "x-api-key": "test-key" },
      data: {
        name: "Inspector paging " + index,
        agent: { type: "agent", id: "agent_taskrunner0000000001", version: 1 },
        environment_id: "env_cloudlimited000000001",
        initial_events: [{ type: "user.message", content: "Fixture only" }],
      },
    });
    expect(created.ok()).toBe(true);
  }
  await signIn(page, "/deployments");
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(3);
  const rows = await page.locator("tbody tr").allTextContents();
  await page.locator("tbody tr").first().getByRole("cell").nth(1).click();
  const panel = page.getByRole("region", { name: "Deployment details" });
  await expect(panel.getByRole("heading").first()).toBeVisible();
  await panel.getByRole("button", { name: "Close details" }).click();
  expect(await page.locator("tbody tr").allTextContents()).toEqual(rows);
  await expect(
    page.getByRole("button", { name: "Previous page", exact: true }),
  ).toBeEnabled();
});
