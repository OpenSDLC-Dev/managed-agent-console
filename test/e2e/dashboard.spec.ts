import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./sign-in";

test("dashboard stays centered and its compact navigation remains usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  const layout = page.locator("[data-dashboard-layout]");
  const main = page.getByRole("main");
  const keyShortcut = main.getByRole("button", { name: "Get API key" });
  for (const shortcut of [
    main.getByRole("link", { name: "Explore docs" }),
    keyShortcut,
  ]) {
    await expect(shortcut).not.toHaveCSS(
      "border-top-color",
      "rgba(0, 0, 0, 0)",
    );
  }
  const bounds = await layout.boundingBox();
  const mainBounds = await main.boundingBox();
  expect(bounds!.width).toBe(960);
  expect(
    Math.abs(
      bounds!.x + bounds!.width / 2 - mainBounds!.x - mainBounds!.width / 2,
    ),
  ).toBeLessThan(1);
  await keyShortcut.click();
  await expect(
    page.getByRole("dialog", { name: "Create API key" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.keyboard.press("Escape");
  await expect(keyShortcut).toBeFocused();
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(page.locator("aside")).toHaveAttribute(
    "data-sidebar-state",
    "collapsed",
  );
  await expect(
    page.getByRole("navigation").getByRole("link", { name: "Dashboard" }),
  ).toHaveAttribute("data-active", "true");
  await expect(
    page.getByRole("navigation").getByRole("link", { name: "API keys" }),
  ).toHaveAttribute("data-active", "false");
  await page.getByRole("button", { name: "Search Ctrl K" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  const managed = page
    .getByRole("navigation")
    .getByRole("button", { name: "Managed Agents" });
  await managed.click();
  await expect(page.locator("aside")).toHaveAttribute(
    "data-sidebar-state",
    "collapsed",
  );
  const group = page.getByRole("dialog", { name: "Managed Agents" });
  await expect(
    group.getByRole("link", { name: "Agents", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(managed).toBeFocused();
  await managed.click();
  await group.getByRole("link", { name: "Agents", exact: true }).click();
  await expect(group).not.toBeVisible();
  await expect(page).toHaveURL(/\/agents$/);
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Dashboard" })
    .click();
  await main.getByRole("link", { name: "Build an agent" }).click();
  await expect(page).toHaveURL(/\/agents\/new$/);
});

test("dashboard and navigation fit a narrow viewport without losing destinations", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await expect(page.locator("aside")).toHaveAttribute(
    "data-sidebar-state",
    "collapsed",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for (const card of await page.locator("[data-dashboard-card]").all()) {
    const bounds = await card.boundingBox();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await expect(page.getByRole("main")).not.toBeVisible();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Files" })
    .click();
  await expect(page).toHaveURL(/\/files$/);
  await expect(page.locator("aside")).toHaveAttribute(
    "data-sidebar-state",
    "collapsed",
  );
  await expect(page.getByRole("main")).toBeVisible();
});

test("navigation preferences survive reload while viewport changes keep the page reachable", async ({
  page,
}) => {
  await signIn(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const build = page.getByRole("button", { name: "Build", exact: true });
  await build.click();
  await page.reload();
  await expect(build).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await page.reload();
  await expect(page.locator("aside")).toHaveAttribute(
    "data-sidebar-state",
    "collapsed",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await expect(page.getByRole("main")).not.toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator("aside")).toHaveAttribute(
    "data-sidebar-state",
    "collapsed",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("main")).toBeVisible();
  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Agents", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Agents", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByRole("main")).toBeVisible();
});

test("exact Agent lookup opens archived records, exposes missing IDs and supports history", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:18080/__reset");
  await signIn(page, "/agents");
  await expect(
    page.getByRole("cell", { name: "Retired agent", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Find agent by ID" })
    .fill("  agent_retired000000000001  ");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Retired agent" }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("textbox", { name: "Find agent by ID" }),
  ).toBeVisible();
  await page.goForward();
  await expect(
    page.getByRole("heading", { name: "Retired agent" }),
  ).toBeVisible();
  await page.goBack();
  await page
    .getByRole("textbox", { name: "Find agent by ID" })
    .fill("agent_missing");
  await page.getByRole("textbox", { name: "Find agent by ID" }).press("Enter");
  await expect(page.getByTestId("error-state")).toHaveAttribute(
    "data-error-status",
    "404",
  );
  await page.getByRole("link", { name: "Agents", exact: true }).last().click();
  await expect(
    page.getByRole("heading", { name: "Agents", exact: true }),
  ).toBeVisible();
});

test("reserved characters in agent lookup cannot select a different upstream route", async ({
  page,
}) => {
  await signIn(page);
  for (const id of [
    "agent_id/versions",
    "agent_id?limit=1",
    "agent_id#versions",
  ]) {
    await page.goto("/agents");
    await page.getByRole("textbox", { name: "Find agent by ID" }).fill(id);
    await page.getByRole("button", { name: "Open", exact: true }).click();
    await expect(
      page.getByText("unsupported proxy path", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Agents", exact: true }).last(),
    ).toBeVisible();
  }
});
