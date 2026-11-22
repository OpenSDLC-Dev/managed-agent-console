import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { grantDashboardPlayground } from "./dashboard-fixture";
import { settleMotion } from "./settle-motion";
import { signIn } from "./sign-in";

test.beforeEach(async ({ request }) => {
  await expect(await request.post("http://127.0.0.1:18080/__reset")).toBeOK();
});

test("dashboard and search stay centered beside the expanded navigation", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  const layout = page.locator("[data-dashboard-layout]");
  const main = page.getByRole("main");
  const keyShortcut = main.getByRole("button", { name: "Get API key" });
  await expect(keyShortcut).toBeVisible();
  await expect(
    page
      .getByRole("banner")
      .getByRole("link", { name: "Platform documentation" }),
  ).toBeVisible();
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
    page.getByRole("dialog", { name: "Connect to the API" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.keyboard.press("Escape");
  await expect(keyShortcut).toBeFocused();
  await expect(
    page.getByRole("button", { name: /collapse sidebar|expand sidebar/i }),
  ).toHaveCount(0);
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
  await expect(page).toHaveURL(/\/agents$/);
  const back = page.getByRole("button", {
    name: /Agents, back to all sections/i,
  });
  await expect(back).toBeFocused();
  await back.press("Escape");
  await expect(agents).toBeFocused();
  await expect(agents).toHaveAttribute("data-active", "true");
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Dashboard" })
    .click();
  await main.getByRole("link", { name: "Build an agent" }).click();
  await expect(page).toHaveURL(/\/agents\/new$/);
});

test("dashboard opens the usage period and each admitted resource shown on its card", async ({
  page,
}) => {
  await grantDashboardPlayground(page);
  await signIn(page);
  const main = page.getByRole("main");
  const overview = main.getByRole("region", { name: "Usage overview" });
  for (const [title, range] of [
    ["Requests this month", "mtd"],
    ["Spend this month", "mtd"],
    ["Prompt caching", "mtd"],
    ["Token volume", "7"],
  ]) {
    const entry = overview.getByRole("link", { name: title, exact: true });
    await expect(entry).toHaveAttribute("href", `/usage?range=${range}`);
  }
  for (const [metric, range] of [
    ["spend", "mtd"],
    ["tokens", "7"],
  ]) {
    const value = overview.locator(
      `[data-dashboard-metric="${metric}"] [data-value]`,
    );
    await expect(value).toBeVisible();
    // The title link extends across the card, including the painted value.
    const bounds = (await value.boundingBox())!;
    await page.mouse.click(bounds.x + 2, bounds.y + bounds.height / 2);
    await expect(page.getByRole("combobox", { name: "Period" })).toHaveValue(
      range,
    );
    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard$/);
  }
  for (const [action, path] of [
    ["Open playground", "/playground"],
    ["View models", "/models"],
    ["Browse skills", "/skills"],
    ["Browse files", "/files"],
  ]) {
    const link = main.getByRole("link", { name: action, exact: true });
    await expect(link).toHaveAttribute("href", path);
    await link.click();
    await expect(page).toHaveURL((url) => url.pathname === path);
    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard$/);
  }
});

test("four provider cards load their local marks and compare model cost and features", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signIn(page);
  const main = page.getByRole("main");
  const models = [
    [
      "deepseek",
      "DeepSeek V4.1 Flash",
      "https://api-docs.deepseek.com/news/news261017/",
    ],
    ["glm", "GLM-5.3", "https://docs.z.ai/guides/llm/glm-5.3"],
    [
      "kimi",
      "Kimi K3",
      "https://platform.kimi.ai/docs/guide/kimi-k3-quickstart",
    ],
    ["minimax", "MiniMax M3", "https://github.com/MiniMax-AI/MiniMax-M3"],
  ];
  for (const [brand, name, href] of models) {
    const mark = main.locator(`img[src="/brands/${brand}.svg"]`);
    await expect(mark).toBeVisible();
    await expect
      .poll(() =>
        mark.evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
      )
      .toBe(true);
    await expect(main.getByRole("link", { name, exact: true })).toHaveAttribute(
      "href",
      href,
    );
  }
  const trigger = main.getByRole("button", { name: "Compare models" });
  await trigger.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Compare models" });
  await expect(
    dialog.getByRole("radio", { name: "Cost", exact: true }),
  ).toBeChecked();
  const selectors = dialog.getByRole("combobox");
  await expect(selectors).toHaveCount(3);
  for (const [i, [, name]] of models.slice(0, 3).entries()) {
    await expect(selectors.nth(i)).toContainText(name);
    await expect(
      dialog.getByRole("link", { name: `View ${name} pricing` }),
    ).toBeVisible();
  }
  const third = dialog.getByRole("combobox", { name: "Model 3", exact: true });
  await third.click();
  await page.getByRole("option", { name: "MiniMax M3", exact: true }).click();
  await expect(third).toContainText("MiniMax M3");
  await dialog
    .getByRole("radio", { name: "Cost", exact: true })
    .press("ArrowRight");
  await expect(
    dialog.getByRole("radio", { name: "Features", exact: true }),
  ).toBeChecked();
  await dialog
    .getByRole("button", { name: "Copy MiniMax-M3", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("MiniMax-M3");
  await settleMotion(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page).toHaveURL(/\/dashboard$/);
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
  const main = page.getByRole("main");
  await expect(
    main.getByRole("link", { name: "MiniMax M3", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  for (const card of await main
    .locator(
      "[data-dashboard-card], [data-dashboard-metric], img[src^='/brands/']",
    )
    .all()) {
    const bounds = await card.boundingBox();
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  }
  const compare = main.getByRole("button", { name: "Compare models" });
  await compare.click();
  const comparison = page.getByRole("dialog", {
    name: "Compare models",
    exact: true,
  });
  await comparison.getByText("Features", { exact: true }).click();
  const selector = comparison.getByRole("combobox", {
    name: "Model 3",
    exact: true,
  });
  await selector.click();
  await page.getByRole("option", { name: "MiniMax M3", exact: true }).click();
  await expect(selector).toContainText("MiniMax M3");
  const bounds = (await comparison.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await comparison.getByRole("button", { name: "Close", exact: true }).click();
  await expect(compare).toBeFocused();
  await settleMotion(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  await expect(page.locator("aside")).toBeHidden();
  const scrollOffset = await page.evaluate(() => {
    window.scrollTo(0, 300);
    return window.scrollY;
  });
  expect(scrollOffset).toBeGreaterThan(0);
  await expect(menu).toBeInViewport();
  const menuBounds = (await menu.boundingBox())!;
  await page.mouse.click(
    menuBounds.x + menuBounds.width / 2,
    menuBounds.y + menuBounds.height / 2,
  );
  const documentation = page.getByRole("link", {
    name: "Platform documentation",
  });
  await expect(documentation).toBeInViewport();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBe(scrollOffset);
  const documentationBounds = (await documentation.boundingBox())!;
  await page.mouse.move(
    documentationBounds.x + documentationBounds.width / 2,
    documentationBounds.y + documentationBounds.height / 2,
  );
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
  await page.keyboard.press("Escape");
  await expect(page.locator("aside")).toBeHidden();
  await menu.click();
  await expect(page.getByRole("navigation")).toHaveAttribute(
    "data-nav-view",
    "root",
  );
  await page.locator('[data-nav-group="Resources"]').click();
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

test("the header menu remains available with a larger browser font", async ({
  page,
  context,
}) => {
  const cdp = await context.newCDPSession(page);
  await cdp.send("Page.setFontSizes", { fontSizes: { standard: 20 } });
  await page.setViewportSize({ width: 850, height: 800 });
  await signIn(page);
  const menu = page.getByRole("button", { name: "Menu", exact: true });
  await expect(page.locator("aside")).toBeHidden();
  await expect(menu).toBeVisible();
  await menu.click();
  await expect(
    page.getByRole("dialog", { name: "Menu", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Account menu" }),
  ).toBeVisible();
});

test("submenus return to all sections and mobile navigation resets on resize", async ({
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
  await page.evaluate(() =>
    localStorage.setItem("managed-agent-console:nav:sidebar", "false"),
  );
  await page.reload();
  await expect(page.locator("aside")).toHaveAttribute(
    "data-sidebar-state",
    "expanded",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(page.getByRole("main")).not.toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  // Wait for React to process the breakpoint before crossing it again.
  await expect(page.getByRole("main")).toBeVisible();
  await expect(page.locator("aside")).toHaveAttribute(
    "data-sidebar-state",
    "expanded",
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
