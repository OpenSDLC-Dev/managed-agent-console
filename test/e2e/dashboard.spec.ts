import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { settleMotion } from "./settle-motion";
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
    page.getByRole("navigation").locator('[data-nav-group="Keys"]'),
  ).toHaveAttribute("data-active", "false");
  const header = page.locator("[data-console-header]");
  const search = header.getByRole("button", { name: /^Search Console/ });
  const headerBounds = await header.boundingBox();
  const searchBounds = await search.boundingBox();
  expect(searchBounds!.width).toBe(448);
  expect(searchBounds!.height).toBe(28);
  expect(searchBounds!.x + searchBounds!.width / 2).toBeCloseTo(
    headerBounds!.x + headerBounds!.width / 2,
    0,
  );
  await search.click();
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await expect(palette).toBeVisible();
  await expect(palette).toHaveCSS("max-width", "672px");
  await expect(palette).toHaveCSS("top", "135px");
  await expect(
    palette.getByRole("combobox", { name: "Search pages and resources" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  const agents = page
    .getByRole("navigation")
    .locator('[data-nav-group="Agents"]');
  await agents.click();
  await expect(page.locator("aside")).toHaveAttribute(
    "data-sidebar-state",
    "collapsed",
  );
  const group = page.getByRole("dialog", { name: "Agents", exact: true });
  await expect(
    group.getByRole("link", { name: "Agents", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(agents).toBeFocused();
  await agents.click();
  await group.getByRole("link", { name: "Agents", exact: true }).click();
  await expect(group).not.toBeVisible();
  await expect(page).toHaveURL(/\/agents$/);
  await expect(agents).toHaveAttribute("data-active", "true");
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
  await expect(
    page
      .locator("[data-console-header]")
      .getByRole("button", { name: /^Search Console/ }),
  ).toHaveCSS("width", "32px");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for (const card of await page.locator("[data-dashboard-card]").all()) {
    const bounds = await card.boundingBox();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  }
  await settleMotion(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  await expect(page.locator("aside")).toBeHidden();
  const scrollOffset = await page.evaluate(() => {
    window.scrollTo(0, 300);
    return window.scrollY;
  });
  expect(scrollOffset).toBeGreaterThan(0);
  await menu.click();
  await page.getByRole("link", { name: "Platform documentation" }).hover();
  await page.mouse.wheel(0, 300);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBe(scrollOffset);
  await page.keyboard.press("Escape");
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBe(scrollOffset);
  await menu.click();
  await expect(page.getByRole("main")).not.toBeVisible();
  await page.locator('[data-nav-group="Resources"]').click();
  await expect(page).toHaveURL(/\/dashboard$/);
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
  await menu.click();
  const drawer = page.getByRole("dialog", { name: "Menu", exact: true });
  await expect(
    drawer.getByRole("link", { name: "Platform documentation" }),
  ).toBeVisible();
  await drawer.getByRole("link", { name: "Files", exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(menu).toBeFocused();
});

test("submenus return to all sections and sidebar width survives reload", async ({
  page,
}) => {
  await signIn(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav).toHaveAttribute("data-nav-view", "root");
  await nav.locator('[data-nav-group="Resources"]').click();
  await expect(nav).toHaveAttribute("data-nav-view", "Resources");
  await expect(page).toHaveURL(/\/files$/);
  await expect(nav.getByRole("link", { name: "Dashboard" })).toHaveCount(0);
  await expect(
    nav.getByRole("link", { name: "Files", exact: true }),
  ).toBeVisible();
  await nav.getByRole("link", { name: "Skills", exact: true }).click();
  await expect(page).toHaveURL(/\/skills$/);
  await expect(
    nav.getByRole("link", { name: "Skills", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(
    nav.getByRole("link", { name: "Files", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.goForward();
  await expect(
    nav.getByRole("link", { name: "Skills", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await nav
    .getByRole("button", { name: "Back to all sections" })
    .getByText("Resources", { exact: true })
    .click();
  await expect(nav).toHaveAttribute("data-nav-view", "root");
  await expect(page).toHaveURL(/\/skills$/);
  const resources = nav.locator('[data-nav-group="Resources"]');
  await expect(resources).toHaveAccessibleName("Resources Skills");
  await expect(resources).toBeFocused();
  await resources.press("Enter");
  await expect(page).toHaveURL(/\/skills$/);
  await nav
    .getByRole("button", { name: "Back to all sections" })
    .locator("svg")
    .click();
  await expect(resources).toBeFocused();
  await nav.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await page.reload();
  await expect(page.locator("aside")).toHaveAttribute(
    "data-sidebar-state",
    "collapsed",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(page.getByRole("main")).not.toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator("aside")).toHaveAttribute(
    "data-sidebar-state",
    "collapsed",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("main")).toBeVisible();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.locator('[data-nav-group="Agents"]').click();
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Agents", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Agents", exact: true, level: 1 }),
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
    page.getByRole("heading", { name: "Agents", exact: true, level: 1 }),
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
    const rejected = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith(
        `/agents/${encodeURIComponent(id)}`,
      ),
    );
    await page.getByRole("button", { name: "Open", exact: true }).click();
    const response = await rejected;
    expect(new URL(response.url()).search).toBe("");
    expect(response.status()).toBe(id.includes("/") ? 401 : 400);
    expect(response.headers()["x-platform-signed-out"]).toBeUndefined();
    await expect(
      page.getByText(
        id.includes("/")
          ? "a browser session cookie is required"
          : "Invalid agent ID.",
        { exact: false },
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Agents", exact: true }).last(),
    ).toBeVisible();
  }
});
