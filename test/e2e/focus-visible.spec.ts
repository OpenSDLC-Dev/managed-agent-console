import { expect, test, type Locator } from "@playwright/test";
import { signIn } from "./sign-in";

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18080/__reset");
});

async function visibleFocus(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      focusVisible: element.matches(":focus-visible"),
      boxShadow: style.boxShadow,
    };
  });
}

async function expectVisibleFocus(locator: Locator) {
  await expect(locator).toBeFocused();
  const indicator = await visibleFocus(locator);
  expect(indicator.focusVisible).toBe(true);
  expect(indicator.boxShadow).not.toBe("none");
  expect(indicator.boxShadow).toMatch(/[23]px/);
}

test("keyboard focus stays visible across composite controls", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/sessions/sesn_research0000000000001");
  const composer = page.getByRole("textbox", {
    name: "Message to the session",
  });
  await composer.click();
  await expectVisibleFocus(composer);

  await page.getByRole("button", { name: "Search Ctrl K" }).click();
  await expectVisibleFocus(
    page.getByRole("combobox", {
      name: "Search agents, sessions, environments…",
    }),
  );
  await page.keyboard.press("Escape");

  await page.goto("/deployments");
  await expect(page.getByText("Weekly research digest")).toBeVisible();
  const status = page.getByRole("combobox", { name: "Deployment status" });
  await status.focus();
  await page.keyboard.press("ArrowDown");
  await expectVisibleFocus(page.getByRole("option", { name: "All live" }));
  await page.keyboard.press("Escape");

  const actions = page.getByRole("button", { name: "More actions" }).first();
  await actions.focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowDown");
  await expectVisibleFocus(page.getByRole("menuitem", { name: "Archive" }));
});
