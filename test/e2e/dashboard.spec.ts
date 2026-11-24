import { expect, test, type Locator } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  dashboardModelCases,
  grantDashboardModelDiscovery,
  setDashboardSession,
} from "./dashboard-fixture";
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
  await expect(page).toHaveURL(/\/agents\/overview$/);
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
  await setDashboardSession(page, { playground_access: true });
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

test("all four model cards open a single-model dialog on Dashboard and return focus to the card", async ({
  page,
  context,
}) => {
  await grantDashboardModelDiscovery(page);
  await signIn(page);
  const main = page.getByRole("main");
  const models = main.getByRole("region", { name: "Models", exact: true });
  const origin = new URL(page.url()).origin;
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin,
  });
  for (const { brand, name, upstream, alias } of dashboardModelCases) {
    const card = models.getByRole("article", { name, exact: true });
    const trigger = card.getByRole("link", { name, exact: true });
    const mark = card.locator(`img[src="/brands/${brand}.svg"]`);
    await expect(mark).toBeVisible();
    await expect
      .poll(() =>
        mark.evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
      )
      .toBe(true);
    await expect(trigger).toHaveAttribute("href", `/dashboard/models/${brand}`);
    await expect(trigger).toHaveAttribute("target", "_blank");
    await expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    if (brand === "glm") {
      await trigger.click();
    } else {
      // Exercise the actual click targets under the stretched title link:
      // a vendor mark, a capability label, and the empty corner of the band.
      const target = {
        deepseek: mark,
        kimi: card.getByRole("listitem").first(),
        minimax: card,
      }[brand];
      await target.scrollIntoViewIfNeeded();
      const bounds = (await target.boundingBox())!;
      if (brand === "minimax")
        await page.mouse.click(bounds.x + bounds.width - 12, bounds.y + 12);
      else
        await page.mouse.click(
          bounds.x + bounds.width / 2,
          bounds.y + bounds.height / 2,
        );
    }
    const dialog = page.getByRole("dialog", { name, exact: true });
    await expect(
      dialog.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(1);
    await expect(page).toHaveURL(origin + "/dashboard");
    await expect(
      dialog.locator(`img[src="/brands/${brand}.svg"]`),
    ).toBeVisible();
    expect(context.pages()).toHaveLength(1);
    const close = dialog.getByRole("button", { name: "Close", exact: true });
    await expect(close).toBeFocused();
    await expect(dialog.getByText("Cost", { exact: true })).toBeVisible();
    await expect(dialog.getByText("Features", { exact: true })).toBeVisible();
    await dialog
      .getByRole("button", { name: `Copy model ID ${upstream}`, exact: true })
      .click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(upstream);
    await expect(
      dialog.getByRole("link", { name: "View full pricing", exact: true }),
    ).toHaveAttribute("href", `/dashboard/models/${brand}#pricing`);
    const playground = dialog.getByRole("link", {
      name: "Try in playground",
      exact: true,
    });
    if (alias) {
      const picker = dialog.getByRole("combobox", {
        name: "Gateway alias",
        exact: true,
      });
      await expect(picker).toBeVisible();
      await expect(playground).toHaveCount(0);
      await picker.selectOption(alias);
      await expect(playground).toHaveAttribute(
        "href",
        `/playground?model=${alias}`,
      );
    } else {
      await expect(
        dialog
          .getByRole("region", { name: "Current deployment" })
          .getByRole("status"),
      ).toContainText("No matching provider is configured.");
      await expect(playground).toHaveCount(0);
    }
    if (brand === "deepseek") {
      const viewport = page.viewportSize()!;
      await settleMotion(page);
      const bounds = (await dialog.boundingBox())!;
      expect(bounds.x + bounds.width / 2).toBeCloseTo(viewport.width / 2, 0);
      expect(bounds.y + bounds.height / 2).toBeCloseTo(viewport.height / 2, 0);
      await page.keyboard.press("Escape");
    } else if (brand === "kimi") {
      const bounds = (await dialog.boundingBox())!;
      await page.mouse.click(bounds.x - 12, bounds.y + 24);
    } else {
      await close.click();
    }
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(page).toHaveURL(origin + "/dashboard");
  }
});

test("the model dialog opens from the keyboard and its guide and pricing links keep native navigation", async ({
  page,
  context,
}) => {
  await signIn(page);
  const main = page.getByRole("main");
  const models = main.getByRole("region", { name: "Models", exact: true });
  const origin = new URL(page.url()).origin;
  for (const { brand, name, upstream, alias, docs } of dashboardModelCases) {
    const trigger = models.getByRole("link", { name, exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name, exact: true });
    await expect(dialog).toBeVisible();
    await expect(page).toHaveURL(origin + "/dashboard");
    await dialog
      .getByRole("button", { name: "More options", exact: true })
      .click();
    const guide = page.getByRole("menuitem", {
      name: "View model guide",
      exact: true,
    });
    const href = `/dashboard/models/${brand}`;
    await expect(guide).toHaveAttribute("href", href);
    await guide.click();
    await expect(page).toHaveURL(origin + href);
    await expect(
      page
        .getByRole("navigation", { name: "Main navigation" })
        .getByRole("link", { name: "Dashboard", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(
      main.getByRole("heading", { name, exact: true, level: 1 }),
    ).toBeVisible();
    await expect(main.locator(`img[src="/brands/${brand}.svg"]`)).toBeVisible();
    const specs = main.getByRole("region", { name: "Upstream specifications" });
    await expect(specs.locator("code")).toHaveText(upstream);
    await expect(
      specs.getByRole("link", { name: "Provider specifications" }),
    ).toHaveAttribute("href", docs);
    const deployment = main.getByRole("region", { name: "Current deployment" });
    if (alias)
      await expect(
        deployment.getByRole("link", { name: alias, exact: true }),
      ).toHaveAttribute("href", `/models?model=${alias}`);
    else
      await expect(
        deployment.getByText("No matching provider is configured.", {
          exact: false,
        }),
      ).toBeVisible();
    await main.getByRole("link", { name: "Dashboard", exact: true }).click();
    await expect(page).toHaveURL(origin + "/dashboard");
  }
  const deepseek = models.getByRole("link", {
    name: "DeepSeek V4.1 Flash",
    exact: true,
  });
  await deepseek.click();
  await page
    .getByRole("dialog", { name: "DeepSeek V4.1 Flash", exact: true })
    .getByRole("link", { name: "View full pricing", exact: true })
    .click();
  await expect(page).toHaveURL(origin + "/dashboard/models/deepseek#pricing");
  await expect(main.locator("#pricing")).toBeInViewport();
  await main.getByRole("link", { name: "Dashboard", exact: true }).click();
  // The card is still a real link for a deliberate open-in-new-tab action.
  const [newTab] = await Promise.all([
    context.waitForEvent("page"),
    deepseek.click({ button: "middle" }),
  ]);
  await expect(newTab).toHaveURL(origin + "/dashboard/models/deepseek");
  await newTab.close();
  await expect(page).toHaveURL(origin + "/dashboard");
  expect(context.pages()).toHaveLength(1);
});

test("model comparison links open the selected local overview and pricing section", async ({
  page,
  context,
}) => {
  await signIn(page);
  const origin = new URL(page.url()).origin;
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin,
  });
  const main = page.getByRole("main");
  const trigger = main.getByRole("button", { name: "Compare models" });
  await trigger.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Compare models" });
  await expect(
    dialog.getByRole("button", { name: "Close", exact: true }),
  ).toBeFocused();
  await expect(
    dialog.getByRole("radio", { name: "Cost", exact: true }),
  ).toBeChecked();
  const selectors = dialog.getByRole("combobox");
  await expect(selectors).toHaveCount(3);
  for (const [i, { brand, name }] of dashboardModelCases
    .slice(0, 3)
    .entries()) {
    await expect(selectors.nth(i)).toContainText(name);
    await expect(
      dialog.getByRole("link", { name: `View pricing for ${name}` }),
    ).toHaveAttribute("href", `/dashboard/models/${brand}#pricing`);
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
  for (const { brand, name } of [
    dashboardModelCases[0],
    dashboardModelCases[1],
    dashboardModelCases[3],
  ]) {
    await expect(
      dialog.getByRole("link", { name: `Model documentation for ${name}` }),
    ).toHaveAttribute("href", `/dashboard/models/${brand}`);
  }
  await settleMotion(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page).toHaveURL(/\/dashboard$/);
  await trigger.click();
  await dialog
    .getByRole("link", { name: "View pricing for DeepSeek V4.1 Flash" })
    .click();
  await expect(page).toHaveURL(origin + "/dashboard/models/deepseek#pricing");
  await expect(main.locator("#pricing")).toBeInViewport();
  await page.goBack();
  await trigger.click();
  await dialog.getByText("Features", { exact: true }).click();
  await dialog
    .getByRole("link", { name: "Model documentation for Kimi K3" })
    .click();
  await expect(page).toHaveURL(origin + "/dashboard/models/kimi");
  await expect(
    main.getByRole("heading", { name: "Kimi K3", level: 1 }),
  ).toBeVisible();
  expect(context.pages()).toHaveLength(1);
});

test("a discovered gateway alias opens Playground and a new agent draft with the selected model without a write", async ({
  page,
}) => {
  await grantDashboardModelDiscovery(page);
  await signIn(page);
  const writes: string[] = [];
  page.on("request", (request) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method()))
      writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  const main = page.getByRole("main");
  await main.getByRole("link", { name: "MiniMax M3", exact: true }).click();
  const preview = page.getByRole("dialog", { name: "MiniMax M3", exact: true });
  const picker = preview.getByRole("combobox", {
    name: "Gateway alias",
    exact: true,
  });
  const tryModel = preview.getByRole("link", {
    name: "Try in playground",
    exact: true,
  });
  const more = preview.getByRole("button", {
    name: "More options",
    exact: true,
  });
  const createAgent = page.getByRole("menuitem", {
    name: "Build an agent",
    exact: true,
  });
  await picker.selectOption("agent-default");
  await expect(tryModel).toHaveCount(0);
  await more.click();
  await expect(createAgent).toHaveAttribute(
    "href",
    "/agents/new?model=agent-default",
  );
  await page.keyboard.press("Escape");
  await expect(preview).toBeVisible();
  await expect(more).toBeFocused();
  await picker.selectOption("minimax-m3");
  await expect(tryModel).toHaveAttribute(
    "href",
    "/playground?model=minimax-m3",
  );
  await tryModel.click();
  await expect(page).toHaveURL(/\/playground\?model=minimax-m3$/);
  const model = main.getByRole("combobox", { name: "Model", exact: true });
  await expect(model).toHaveAttribute("data-model", "minimax-m3");
  await expect(model).toContainText("MiniMax M3");
  await page.goto("/dashboard");
  await main.getByRole("link", { name: "MiniMax M3", exact: true }).click();
  await picker.selectOption("minimax-m3");
  await more.click();
  await expect(createAgent).toHaveAttribute(
    "href",
    "/agents/new?model=minimax-m3",
  );
  await createAgent.click();
  await expect(page).toHaveURL(/\/agents\/new\?model=minimax-m3$/);
  await expect(model).toHaveAttribute("data-model", "minimax-m3");
  await expect(model.getByText("minimax-m3", { exact: true })).toBeVisible();
  await expect(
    main.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("");
  await page.goto("/dashboard/models/minimax");
  const deployment = main.getByRole("region", { name: "Current deployment" });
  const alias = deployment.getByRole("link", {
    name: "minimax-m3",
    exact: true,
  });
  await expect(alias).toHaveAttribute("href", "/models?model=minimax-m3");
  await alias.click();
  await expect(page).toHaveURL(/\/models\?model=minimax-m3$/);
  await expect(
    main
      .getByRole("region", { name: "Model details" })
      .getByRole("heading", { name: "minimax-m3", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard\/models\/minimax$/);
  const open = deployment.getByRole("link", {
    name: "Open in Playground for minimax-m3",
    exact: true,
  });
  await expect(open).toHaveAttribute("href", "/playground?model=minimax-m3");
  await expect(
    deployment.getByRole("link", {
      name: "Open in Playground for agent-default",
    }),
  ).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole("button", { name: "Menu", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await settleMotion(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await open.click();
  await expect(page).toHaveURL(/\/playground\?model=minimax-m3$/);
  await expect(model).toHaveAttribute("data-model", "minimax-m3");
  await expect(model).toContainText("MiniMax M3");
  expect(writes).toEqual([]);
});

test("a provider rate edit reaches the model card, comparison and model guide", async ({
  page,
}) => {
  const modelName = "DeepSeek V4.1 Flash";
  const deploymentId = "gwdep_dsflash01";
  const deploymentSelector = `[data-pricing-deployment="${deploymentId}"]`;
  const terms = "Domestic standard service for the operator's test deployment.";
  const readUpdatedRates = async (surface: Locator) => {
    const pricing = surface.locator(deploymentSelector);
    await expect(pricing).toBeVisible();
    await expect(pricing).toHaveAttribute("data-price-currency", "CNY");
    for (const [kind, value] of [
      ["input", "7.625"],
      ["output", "0"],
      ["cache_read", "0.03125"],
      ["cache_write", ""],
    ]) {
      await expect(
        pricing.locator(`[data-price-kind="${kind}"]`),
      ).toHaveAttribute("data-price", value);
    }
    await expect(pricing).toContainText(terms);
  };

  await signIn(page);
  const main = page.getByRole("main");
  const trigger = main.getByRole("link", { name: modelName, exact: true });
  const card = page.getByRole("dialog", { name: modelName, exact: true });
  await trigger.click();
  const previous = card.locator(deploymentSelector);
  await expect(previous).toHaveAttribute("data-price-currency", "");
  await expect(previous.locator('[data-price-kind="input"]')).toHaveAttribute(
    "data-price",
    "1",
  );
  await card.getByRole("link", { name: "View full pricing" }).click();
  await main
    .getByRole("region", { name: "Current deployment" })
    .getByRole("link", { name: "DeepSeek", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit deepseek-v4-flash", exact: true })
    .click();
  const edit = page.getByRole("dialog", { name: "Edit upstream model" });
  await edit.getByLabel("Price currency", { exact: true }).fill("CNY");
  await edit.getByLabel("Pricing terms", { exact: true }).fill(terms);
  await edit.getByLabel("Input", { exact: true }).fill("7.625");
  await edit.getByLabel("Output", { exact: true }).fill("0");
  await edit.getByLabel("Cache read", { exact: true }).fill("0.03125");
  await expect(edit.getByLabel("Cache write", { exact: true })).toHaveValue("");
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname ===
        `/admin/v1/deployments/${deploymentId}`,
  );
  await edit.getByRole("button", { name: "Save", exact: true }).click();
  const response = await saved;
  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({
    id: deploymentId,
    prices: { input: 7.625, output: 0, cache_write: null, cache_read: 0.03125 },
    price_currency: "CNY",
    price_note: terms,
  });
  await expect(edit).toBeHidden();
  await page.getByRole("link", { name: "Agent Console", exact: true }).click();
  await trigger.click();
  await readUpdatedRates(card);
  await card.getByRole("button", { name: "Close", exact: true }).click();
  await main
    .getByRole("button", { name: "Compare models", exact: true })
    .click();
  const column = page.getByRole("region", {
    name: "Comparison column 1",
    exact: true,
  });
  await readUpdatedRates(column);
  await column
    .getByRole("link", { name: `View pricing for ${modelName}` })
    .click();
  await expect(page).toHaveURL(/\/dashboard\/models\/deepseek#pricing$/);
  await readUpdatedRates(main.locator("#pricing"));
});

test("a model with one discovered alias offers Playground when agent creation is unavailable", async ({
  page,
  request,
}) => {
  await expect(
    await request.post("http://127.0.0.1:18080/__forbid", {
      data: { paths: ["v1/agents"] },
    }),
  ).toBeOK();
  await grantDashboardModelDiscovery(page);
  await signIn(page);
  await page
    .getByRole("main")
    .getByRole("link", { name: "MiniMax M3", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "MiniMax M3", exact: true });
  await expect(
    dialog.getByRole("link", { name: "Try in playground", exact: true }),
  ).toHaveAttribute("href", "/playground?model=minimax-m3");
  await expect(
    dialog.getByRole("combobox", { name: "Gateway alias", exact: true }),
  ).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "More options", exact: true })
    .click();
  await expect(
    page.getByRole("menuitem", { name: "View model guide", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Build an agent", exact: true }),
  ).toHaveCount(0);
});

test("a developer can read the model reference when access to the gateway and Playground is denied", async ({
  page,
  request,
}) => {
  await expect(
    await request.post("http://127.0.0.1:18080/__forbid", {
      data: { paths: ["admin/v1/"] },
    }),
  ).toBeOK();
  await setDashboardSession(page, { role: "developer" });
  const discovery: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.endsWith("/proxy/v1/models")) discovery.push(path);
  });
  await signIn(page);
  const main = page.getByRole("main");
  await main.getByRole("link", { name: "MiniMax M3", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "MiniMax M3", exact: true });
  await expect(
    dialog.getByRole("button", {
      name: "Copy model ID MiniMax-M3",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("link", { name: "Try in playground", exact: true }),
  ).toHaveCount(0);
  await expect(dialog.locator("[data-pricing-deployment]")).toHaveCount(0);
  const blocked = "Your account cannot view provider configuration.";
  await expect(
    dialog.getByRole("region", { name: "Cost" }).getByRole("status"),
  ).toHaveText(blocked);
  await page.goto("/dashboard/models/minimax");
  await expect(
    main.getByRole("heading", { name: "MiniMax M3", level: 1 }),
  ).toBeVisible();
  await expect(
    main
      .getByRole("region", { name: "Upstream specifications" })
      .locator("code"),
  ).toHaveText("MiniMax-M3");
  const deployment = main.getByRole("region", { name: "Current deployment" });
  await expect(deployment.getByRole("status")).toHaveText(blocked);
  await expect(deployment.locator("[data-gateway-alias]")).toHaveCount(0);
  await expect(main.locator("#pricing [data-pricing-deployment]")).toHaveCount(
    0,
  );
  await expect(main.locator('a[href^="/playground"]')).toHaveCount(0);
  expect(discovery).toEqual([]);
  await main.getByRole("link", { name: "Dashboard", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await main
    .getByRole("button", { name: "Compare models", exact: true })
    .click();
  const comparison = page.getByRole("dialog", {
    name: "Compare models",
    exact: true,
  });
  await expect(
    comparison
      .getByRole("region", { name: "Comparison column 1" })
      .getByRole("status"),
  ).toHaveText(blocked);
  await expect(comparison.locator("[data-pricing-deployment]")).toHaveCount(0);
});

test("the dark model dialog scrolls independently on a narrow screen and restores card focus", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.setViewportSize({ width: 390, height: 600 });
  await grantDashboardModelDiscovery(page);
  await signIn(page);
  const trigger = page
    .getByRole("main")
    .getByRole("link", { name: "MiniMax M3", exact: true });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "MiniMax M3", exact: true });
  await dialog
    .getByRole("combobox", { name: "Gateway alias", exact: true })
    .selectOption("minimax-m3");
  const action = dialog.getByRole("link", {
    name: "Try in playground",
    exact: true,
  });
  await expect(action).toHaveAttribute("href", "/playground?model=minimax-m3");
  const content = dialog.locator("[data-model-popup-scroll]");
  const bounds = (await dialog.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(600);
  const scrollOffset = await page.evaluate(() => window.scrollY);
  const initial = await content.evaluate((el) => el.scrollTop);
  await content.hover();
  await page.mouse.wheel(0, 650);
  await expect
    .poll(() => content.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(initial);
  await expect(dialog.getByText("Features", { exact: true })).toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollOffset);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await settleMotion(page);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(trigger).toBeFocused();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("a Playground-only user opening a dashboard model bookmark lands in Playground", async ({
  page,
}) => {
  await signIn(page);
  await setDashboardSession(page, { role: "user", playground_access: true });
  await page.goto("/dashboard/models/minimax");
  await expect(page).toHaveURL(/\/playground$/);
  await expect(
    page
      .getByRole("main")
      .getByRole("heading", { name: "Playground", exact: true, level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Current deployment" }),
  ).toHaveCount(0);
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
  await expect(page).toHaveURL(/\/resources$/);
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
    nav.getByRole("link", { name: "Overview", exact: true }),
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
