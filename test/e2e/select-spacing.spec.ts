import { expect, test, type Locator } from "@playwright/test";
import { openApiKeyForm } from "../api-key-flow";
import { signIn } from "./sign-in";

const endPadding = (field: Locator) =>
  field.evaluate((element) =>
    parseFloat(getComputedStyle(element).paddingInlineEnd),
  );

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18080/__reset");
});

test("API usage navigation and compact filters preserve a selected long model across reload", async ({
  page,
}) => {
  const alias = "retired-" + "long-model-".repeat(17);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "/usage?alias=" + alias);
  const model = page.getByRole("combobox", { name: "Model", exact: true });
  await expect(model).toHaveValue(alias);
  await page.reload();
  await expect(model).toHaveValue(alias);
  const chip = model.locator("..");
  const bounds = await model.boundingBox();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  const arrow = (await chip.locator("svg").boundingBox())!;
  expect(
    bounds!.x + bounds!.width - arrow.x - arrow.width,
  ).toBeGreaterThanOrEqual(10);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await model.click();
  const longOption = model.getByRole("option", { name: alias, exact: true });
  await expect(longOption).toBeVisible();
  const openBounds = await longOption.boundingBox();
  expect(openBounds!.x + openBounds!.width).toBeLessThanOrEqual(390);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1280, height: 800 });
  await model.click();
  const longDesktop = (await longOption.boundingBox())!;
  // The reference menu is 320px, including a border and 6px inset on each side.
  expect(longDesktop.width).toBeCloseTo(306, 0);
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await model.selectOption("");
  await expect(page).toHaveURL(/\/usage$/);
  const range = page.getByRole("combobox", { name: "Range", exact: true });
  await range.click();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(range).toHaveValue("7");
  await page.reload();
  await expect(range).toHaveValue("7");
  await expect(
    page.getByRole("heading", { name: "Usage", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(
    page
      .getByRole("navigation")
      .getByRole("link", { name: "API usage", exact: true }),
  ).toHaveAttribute("href", "/usage");
  await expect(model).toHaveValue("");
  expect((await chip.boundingBox())!.width).toBeLessThan(130);
  await model.click();
  const allModels = model.getByRole("option", { name: "All", exact: true });
  await expect(allModels).toBeVisible();
  const optionBounds = await allModels.boundingBox();
  const chipBounds = await chip.boundingBox();
  expect(Math.abs(optionBounds!.x - chipBounds!.x)).toBeLessThanOrEqual(8);
  expect(optionBounds!.width).toBeGreaterThanOrEqual(300);
  expect(await endPadding(allModels)).toBeGreaterThanOrEqual(10);
  await page.keyboard.press("Escape");
  await range.click();
  const rangeBounds = await range
    .getByRole("option", { name: "Last 30 days" })
    .boundingBox();
  expect(rangeBounds!.x + rangeBounds!.width).toBeLessThanOrEqual(1280);
});

test("native fields and shared select menus leave space for indicators", async ({
  page,
}) => {
  await signIn(page, "/settings/members");
  const role = page.getByRole("combobox", { name: "Filter by role" });
  await expect(role).toBeVisible();
  expect(await endPadding(role)).toBeGreaterThanOrEqual(30);
  await page.emulateMedia({ forcedColors: "active" });
  await expect(role).toHaveCSS("appearance", "auto");
  await page.emulateMedia({ forcedColors: "none" });
  await page.goto("/workspaces/default/deployments");
  const status = page.getByRole("combobox", { name: "Deployment status" });
  await expect(status).toBeVisible();
  expect(await endPadding(status)).toBeGreaterThanOrEqual(10);
  const triggerBox = await status.boundingBox();
  const arrowBox = await status.locator("svg").last().boundingBox();
  expect(
    triggerBox!.x + triggerBox!.width - arrowBox!.x - arrowBox!.width,
  ).toBeGreaterThanOrEqual(10);
  await status.click();
  const selected = page.getByRole("option", { selected: true });
  await expect(selected).toBeVisible();
  expect(await endPadding(selected)).toBeGreaterThanOrEqual(32);
  await page.keyboard.press("Escape");
  await expect(status).toBeFocused();
});

test("a long linked account name leaves the native form chevron clear", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/workspaces/default/service_accounts?*", (route) =>
    route.fulfill({
      json: {
        data: [{ id: "svc_long", name: "W".repeat(100) }],
        next_page: null,
      },
    }),
  );
  await signIn(page, "/settings/keys");
  const form = await openApiKeyForm(page);
  const owner = form.getByLabel("Linked account", { exact: true });
  const trailingEdge = async () => {
    const bounds = (await owner.boundingBox())!;
    return page.screenshot({
      clip: {
        x: Math.round(bounds.x + bounds.width) - 28,
        y: Math.round(bounds.y) + 5,
        width: 24,
        height: Math.round(bounds.height) - 10,
      },
      animations: "disabled",
    });
  };
  const original = await trailingEdge();
  await owner.selectOption("svc_long");
  await expect(owner).toHaveValue("svc_long");
  expect((await trailingEdge()).equals(original)).toBe(true);
});

test.describe("touch filters", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });

  test("the native mobile picker keeps the selected range across refresh", async ({
    page,
  }) => {
    await signIn(page, "/usage");
    const range = page.getByRole("combobox", { name: "Range", exact: true });
    await expect(range).toBeVisible();
    expect(
      await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
    ).toBe(true);
    await expect(range).not.toHaveCSS("appearance", "base-select");
    await range.selectOption("90");
    await expect(page).toHaveURL(/range=90/);
    await page.reload();
    await expect(range).toHaveValue("90");
  });
});
