import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { settleMotion } from "./settle-motion";
import { signIn } from "./sign-in";
const MOCK = "http://127.0.0.1:18080";
const GATED = "sesn_gatedbash00000000001";
const RESEARCH = "sesn_research0000000000001";
test.beforeEach(async ({ request }) => {
  await request.post(MOCK + "/__reset");
});

test("Quickview opens the last complete turn and the detail retains a late failed result with its original call", async ({
  page,
}) => {
  const event = (id: string, type: string, extra: object = {}) => ({
    id,
    type,
    processed_at: "2026-08-01T10:00:00Z",
    ...extra,
  });
  const first = [
    event("first", "user.message", { content: "First request" }),
    event("call", "agent.tool_use", {
      name: "read",
      input: { path: "readme" },
    }),
  ];
  const next = [
    event("approved", "user.tool_confirmation", {
      tool_use_id: "call",
      result: "allow",
      processed_at: "2026-08-01T10:00:01Z",
    }),
    event("second", "user.message", { content: "Second request" }),
    event("failure", "agent.tool_result", {
      tool_use_id: "call",
      is_error: true,
      content: "Read failed",
      processed_at: "2026-08-01T10:00:04Z",
    }),
    event("reply", "agent.message", { content: "Second answer" }),
  ];
  await page.route("**/proxy/v1/sessions/" + GATED + "/events?*", (route) => {
    const p = new URL(route.request().url()).searchParams.get("page");
    return route.fulfill({
      json: p
        ? { data: next, next_page: null }
        : { data: first, next_page: "second-page" },
    });
  });
  await signIn(page, "/workspaces/default/sessions?session=" + GATED);
  const drawer = page.getByRole("region", { name: "Session details" });
  const count = drawer.locator("[data-current-turn]");
  await expect(count).toHaveAttribute("data-current-turn", "2");
  await expect(count).toHaveAttribute("data-turn-count", "2");
  await expect(
    drawer.getByText("Second answer", { exact: true }),
  ).toBeVisible();
  await drawer.getByRole("button", { name: "Previous turn" }).click();
  const call = drawer.locator('[data-tool-call="call"]');
  await expect(call).toHaveAttribute("data-tool-outcome", "Failed");
  await call.locator("summary").click();
  await expect(call.getByText("Read failed")).toBeVisible();
  await drawer.getByRole("button", { name: "Next turn" }).click();
  await expect(count).toHaveAttribute("data-current-turn", "2");
  await drawer.getByRole("link", { name: "Open", exact: true }).click();
  const t1 = page.locator('[data-turn-id="first"]');
  const t2 = page.locator('[data-turn-id="second"]');
  await expect(t2.getByText("Second answer")).toBeVisible();
  await t1.locator("summary").filter({ hasText: "Failed" }).click();
  await t1.getByText("Read failed").click();
  await expect(page.getByTestId("event-detail")).toHaveAttribute(
    "data-event-id",
    "failure",
  );
  await page.reload();
  await expect(page.getByTestId("event-detail")).toHaveAttribute(
    "data-event-id",
    "failure",
  );
  await page.getByRole("tab", { name: "Tools", exact: true }).click();
  const read = page.locator('[data-tool-name="read"]');
  await expect(read).toHaveAttribute("data-call-count", "1");
  await expect(read).toHaveAttribute("data-failed-count", "1");
  await expect(read).toHaveAttribute("data-median-elapsed-ms", "4000");
  await read.click();
  const timing = page.locator('[data-call-id="call"]');
  await expect(timing).toHaveAttribute("data-elapsed-ms", "4000");
  await expect(timing).toHaveAttribute("data-approval-wait-ms", "1000");
});

test("Session selection restores filters and history, supports API and opens the full page explicitly", async ({
  page,
}) => {
  await signIn(page, "/workspaces/default/sessions?order=asc");
  await page
    .getByRole("row")
    .filter({ hasText: "Install deps and run tests" })
    .getByRole("button", { name: "Quickview" })
    .click();
  const panel = page.getByRole("region", { name: "Session details" });
  await expect(panel).toHaveAttribute("data-session-id", GATED);
  await expect(page).toHaveURL(new RegExp("order=asc&session=" + GATED));
  await expect(
    panel.getByRole("heading", { name: "Transcript" }),
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
  await expect(page).toHaveURL("/workspaces/default/sessions?order=asc");
  await expect(page.getByLabel("Find session by ID")).toBeFocused();
  await page.getByLabel("Find session by ID").fill(RESEARCH);
  await page.getByRole("button", { name: "Quickview" }).click();
  await expect(panel).toHaveAttribute("data-session-id", RESEARCH);
  await panel.getByRole("link", { name: "Open", exact: true }).click();
  await expect(page).toHaveURL("/workspaces/default/sessions/" + RESEARCH);
});

test("inspecting a row on page two retains its cursor when selecting and closing", async ({
  page,
  request,
}) => {
  for (let index = 0; index < 21; index++) {
    const created = await request.post(MOCK + "/v1/sessions", {
      headers: {
        "x-api-key": "sk-map-api01-mock-owned-test-key-00000000000000000000001",
      },
      data: {
        agent: "agent_taskrunner0000000001",
        environment_id: "env_egress000000000000001",
        title: "Inspector pagination " + index,
      },
    });
    expect(created.ok()).toBe(true);
  }
  await signIn(page, "/workspaces/default/sessions");
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
  await page
    .locator("tbody tr")
    .first()
    .getByRole("button", { name: "Quickview" })
    .click();
  const panel = page.getByRole("region", { name: "Session details" });
  await expect(
    panel.getByRole("heading", { name: "Transcript" }),
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
  await signIn(page, "/workspaces/default/sessions?session=" + GATED);
  const panel = page.getByRole("region", { name: "Session details" });
  await expect(
    panel.getByRole("heading", { name: "Install deps and run tests" }),
  ).toBeVisible();
  const separator = panel.getByRole("separator", { name: "Resize panel" });
  await separator.focus();
  const width = Number(await separator.getAttribute("aria-valuenow"));
  await separator.press("ArrowLeft");
  await expect(separator).toHaveAttribute("aria-valuenow", String(width + 32));
  for (const narrowWidth of [390, 360]) {
    await page.setViewportSize({ width: narrowWidth, height: 844 });
    // Resizing the browser precedes its matchMedia/resize subscribers on macOS.
    // Measure the responsive state, not the still-expanded desktop sidebar.
    await expect(page.locator("[data-sidebar-state]")).toHaveAttribute(
      "data-sidebar-state",
      "collapsed",
    );
    await expect(separator).toHaveAttribute(
      "aria-valuenow",
      String(narrowWidth - 64),
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await settleMotion(page);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  }
  await panel.getByRole("button", { name: "Close details" }).click();
  await page.goto("/workspaces/default/sessions?session=sesn_missing");
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
  await signIn(page, "/workspaces/default/sessions?order=asc");
  for (const activation of ["click", "keyboard"]) {
    const row = page.getByRole("row").filter({
      has: page.getByRole("link", {
        name: "Install deps and run tests",
        exact: true,
      }),
    });
    const open = row.getByRole("link", {
      name: "Install deps and run tests",
      exact: true,
    });
    if (activation === "click") await open.click();
    else await open.press("Enter");
    await expect(page).toHaveURL("/workspaces/default/sessions/" + GATED);
    await page.goBack();
    await expect(page).toHaveURL("/workspaces/default/sessions?order=asc");
    await expect(
      page.getByRole("region", { name: "Session details" }),
    ).toHaveCount(0);
  }
});
