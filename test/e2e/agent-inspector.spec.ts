import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { settleMotion } from "./settle-motion";
import { signIn } from "./sign-in";

const AGENT = "agent_researcher00000000001";
const TASK = "agent_taskrunner0000000001";
test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18080/__reset");
});

test("the Agents directory stays on the current page after a refresh", async ({
  page,
}) => {
  // Exercise the fixture's forward-only cursors with one existing agent per page.
  await page.route("**/proxy/v1/agents?*", async (route) => {
    const url = new URL(route.request().url());
    url.searchParams.set("limit", "1");
    await route.fulfill({ response: await route.fetch({ url: url.href }) });
  });
  const first = page.getByRole("cell", {
    name: "Deep researcher",
    exact: true,
  });
  const second = page.getByRole("cell", {
    name: "General task agent",
    exact: true,
  });
  const next = page.getByRole("button", { name: "Next page" });
  const previous = page.getByRole("button", { name: "Previous page" });
  await signIn(page, "/workspaces/default/agents?status=all");
  await expect(first).toBeVisible();
  await next.click();
  await expect(second).toBeVisible();
  await page.reload();
  await expect(second).toBeVisible();
  const secondUrl = new URL(page.url());
  expect(secondUrl.searchParams.get("page")).toBeTruthy();
  expect(secondUrl.searchParams.get("status")).toBe("all");

  await page.getByRole("combobox", { name: "Created filter" }).click();
  await page.getByRole("button", { name: "Custom range" }).click();
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page).toHaveURL(secondUrl.href);

  await next.click();
  await expect(page.getByRole("cell", { name: "Retired agent" })).toBeVisible();
  await page.reload();
  await previous.click();
  await expect(page).toHaveURL(secondUrl.href);
  await expect(second).toBeVisible();
  await second.click();
  const drawer = page.getByRole("region", { name: "Agent details" });
  await expect(drawer).toHaveAttribute("data-agent-id", TASK);
  await drawer.getByRole("button", { name: "Close details" }).click();
  await previous.click();
  await expect(first).toBeVisible();
  await expect(page).toHaveURL("/workspaces/default/agents?status=all");
  await page.goBack();
  await expect(second).toBeVisible();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page).toHaveURL("/workspaces/default/agents");
  await expect(first).toBeVisible();
});

test("agent inspector retains filters, selection and history before opening the full page", async ({
  page,
}) => {
  await signIn(
    page,
    "/workspaces/default/agents?created=2026-08-01~2026-08-02",
  );
  const row = page.getByRole("row").filter({ hasText: "Deep researcher" });
  await row.getByRole("cell", { name: "Deep researcher" }).click();
  const panel = page.getByRole("region", { name: "Agent details" });
  await expect(
    panel.getByRole("heading", { name: "Deep researcher" }),
  ).toBeVisible();
  await expect(page).toHaveURL(
    /created=2026-08-01%7E2026-08-02&agent=agent_researcher00000000001/,
  );
  await expect(row).toHaveAttribute("data-state", "selected");
  await expect(panel.locator("[data-version]")).toHaveAttribute(
    "data-version",
    "3",
  );
  await panel.getByRole("button", { name: "API", exact: true }).click();
  await expect(
    panel.getByRole("button", { name: "API", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(panel.locator("pre")).toContainText('"name": "Deep researcher"');
  await panel.getByRole("button", { name: "Rendered", exact: true }).click();
  await panel.getByRole("button", { name: "Close details" }).click();
  await expect(panel).toBeHidden();
  await expect(row).toBeFocused();
  await page.goBack();
  await expect(panel).toHaveAttribute("data-agent-id", AGENT);
  await page.reload();
  await expect(
    panel.getByRole("heading", { name: "Deep researcher" }),
  ).toBeVisible();
  await panel.getByRole("link", { name: "Open", exact: true }).click();
  await expect(page).toHaveURL("/workspaces/default/agents/" + AGENT);
  await page.goBack();
  await expect(panel).toHaveAttribute("data-agent-id", AGENT);
  await expect(page).toHaveURL(/created=2026-08-01%7E2026-08-02/);
});

test("agent permissions follow the selected resource and remain usable at narrow widths", async ({
  page,
}) => {
  await signIn(page, "/workspaces/default/agents?agent=" + TASK);
  const panel = page.getByRole("region", { name: "Agent details" });
  await expect(
    panel.getByRole("heading", { name: "General task agent" }),
  ).toBeVisible();
  await panel.getByRole("button", { name: /^Tool permissions 8/ }).click();
  await expect(
    panel.locator('[data-tool-name][data-permission-policy="always_ask"]'),
  ).toHaveCount(8);
  // Traverse the order returned by this server fixture.
  await panel.getByRole("button", { name: "Previous agent" }).click();
  await expect(panel).toHaveAttribute("data-agent-id", AGENT);
  await panel.getByRole("button", { name: /^Tool permissions 8/ }).click();
  await expect(
    panel.locator('[data-tool-name][data-permission-policy="always_allow"]'),
  ).toHaveCount(8);
  await expect(panel.locator('[data-agent-id="' + TASK + '"]')).toHaveAttribute(
    "data-agent-version",
    "1",
  );
  await panel.getByRole("button", { name: "Next agent" }).click();
  await expect(panel).toHaveAttribute("data-agent-id", TASK);
  const resize = panel.getByRole("separator", { name: "Resize panel" });
  await resize.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(resize).toHaveAttribute("aria-valuenow", "592");
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.getByRole("button", { name: /^Tool permissions 8/ }).click();
  await expect(
    panel.getByRole("button", { name: "Close details" }),
  ).toBeInViewport();
  expect(
    await panel.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await settleMotion(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await panel.getByRole("button", { name: "API", exact: true }).click();
  await expect(panel.locator("pre")).toContainText('"permission_policy"');
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(
    page.getByRole("textbox", { name: "Find agent by ID" }),
  ).toBeFocused();
});
