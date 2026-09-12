import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./sign-in";
const MOCK = "http://127.0.0.1:18080";
const GATED = "sesn_gatedbash00000000001";
const RESEARCH = "sesn_research0000000000001";
test.beforeEach(async ({ request }) => {
  await request.post(MOCK + "/__reset");
});

test("Session selection restores filters and history, supports API and opens the full page explicitly", async ({
  page,
}) => {
  await signIn(page, "/sessions?order=asc");
  await page
    .getByRole("cell", { name: "Install deps and run tests", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "Session details" });
  await expect(panel).toHaveAttribute("data-session-id", GATED);
  await expect(page).toHaveURL(new RegExp("order=asc&session=" + GATED));
  await expect(
    panel.getByRole("heading", { name: "Latest activity" }),
  ).toBeVisible();
  await expect(panel.locator("[data-event-id]").first()).toBeVisible();
  await panel.getByRole("button", { name: "API", exact: true }).click();
  await expect(panel.getByText(/"stats":/)).toBeVisible();
  await expect(panel.getByText(/events\?order=desc&limit=40/)).toBeVisible();
  await panel.getByRole("button", { name: "Next session" }).click();
  await expect(panel).toHaveAttribute("data-session-id", RESEARCH);
  await page.goBack();
  await expect(panel).toHaveAttribute("data-session-id", GATED);
  await page.reload();
  await expect(
    panel.getByRole("heading", { name: "Install deps and run tests" }),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Close details" }).click();
  await expect(page).toHaveURL("/sessions?order=asc");
  await expect(page.getByLabel("Find session by ID")).toBeFocused();
  await page.getByLabel("Find session by ID").fill(RESEARCH);
  await page.getByLabel("Find session by ID").press("Enter");
  await expect(panel).toHaveAttribute("data-session-id", RESEARCH);
  await panel.getByRole("link", { name: "Open", exact: true }).click();
  await expect(page).toHaveURL("/sessions/" + RESEARCH);
});

test("inspecting a row on page two retains its cursor when selecting and closing", async ({
  page,
  request,
}) => {
  for (let index = 0; index < 21; index++) {
    const created = await request.post(MOCK + "/v1/sessions", {
      headers: { "x-api-key": "test-key" },
      data: {
        agent: "agent_taskrunner0000000001",
        environment_id: "env_cloudlimited000000001",
        title: "Inspector pagination " + index,
      },
    });
    expect(created.ok()).toBe(true);
  }
  await signIn(page, "/sessions");
  const nextPage = page.waitForRequest(
    (req) =>
      new URL(req.url()).pathname.endsWith("/v1/sessions") &&
      new URL(req.url()).searchParams.has("page"),
  );
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  const cursor = new URL((await nextPage).url()).searchParams.get("page");
  await expect(page.locator("tbody tr")).toHaveCount(3);
  const rows = await page.locator("tbody tr").allTextContents();
  const queries: string[] = [];
  page.on("request", (req) => {
    if (new URL(req.url()).pathname.endsWith("/v1/sessions"))
      queries.push(new URL(req.url()).searchParams.get("page") ?? "");
  });
  await page.locator("tbody tr").first().getByRole("cell").nth(1).click();
  const panel = page.getByRole("region", { name: "Session details" });
  await expect(
    panel.getByRole("heading", { name: "Latest activity" }),
  ).toBeVisible();
  await panel.getByRole("button", { name: "Close details" }).click();
  expect(await page.locator("tbody tr").allTextContents()).toEqual(rows);
  expect(queries.every((value) => value === cursor)).toBe(true);
  await expect(
    page.getByRole("button", { name: "Previous page", exact: true }),
  ).toBeEnabled();
});

test("deep links, missing sessions, resizing and narrow inspector accessibility remain usable", async ({
  page,
}) => {
  await signIn(page, "/sessions?session=" + GATED);
  const panel = page.getByRole("region", { name: "Session details" });
  await expect(
    panel.getByRole("heading", { name: "Install deps and run tests" }),
  ).toBeVisible();
  const separator = panel.getByRole("separator", { name: "Resize panel" });
  await separator.focus();
  const width = Number(await separator.getAttribute("aria-valuenow"));
  await separator.press("ArrowLeft");
  await expect(separator).toHaveAttribute("aria-valuenow", String(width + 32));
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await panel.getByRole("button", { name: "Close details" }).click();
  await page.getByLabel("Find session by ID").fill("sesn_missing");
  await page.getByLabel("Find session by ID").press("Enter");
  await expect(panel.getByTestId("error-state")).toHaveAttribute(
    "data-error-status",
    "404",
  );
  await panel.getByRole("button", { name: "Close details" }).click();
  await expect(page.getByLabel("Find session by ID")).toBeFocused();
});

test("row Open enters the full session without inserting an inspector history entry", async ({
  page,
}) => {
  await signIn(page, "/sessions?order=asc");
  for (const activation of ["click", "keyboard"]) {
    const row = page.getByRole("row").filter({
      has: page.getByRole("cell", {
        name: "Install deps and run tests",
        exact: true,
      }),
    });
    const open = row.getByRole("link", { name: "Open", exact: true });
    if (activation === "click") await open.click();
    else await open.press("Enter");
    await expect(page).toHaveURL("/sessions/" + GATED);
    await page.goBack();
    await expect(page).toHaveURL("/sessions?order=asc");
    await expect(
      page.getByRole("region", { name: "Session details" }),
    ).toHaveCount(0);
  }
});
