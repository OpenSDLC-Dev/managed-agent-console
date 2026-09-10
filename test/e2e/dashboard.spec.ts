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
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Managed Agents" })
    .click();
  await expect(page.locator("aside")).toHaveAttribute(
    "data-sidebar-state",
    "expanded",
  );
  await page
    .getByRole("navigation")
    .getByRole("link", { name: "Agents", exact: true })
    .click();
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
