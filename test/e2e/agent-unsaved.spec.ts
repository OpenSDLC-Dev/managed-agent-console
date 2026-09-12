import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./sign-in";

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18080/__reset");
});

test("agent modal retains drafts on Stay and discards only on Leave", async ({
  page,
}) => {
  await signIn(page, "/agents");
  await page.getByRole("button", { name: "Create agent", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("Unsaved draft");
  await page.getByRole("button", { name: "Close", exact: true }).click();
  const prompt = page.getByRole("dialog", {
    name: "Unsaved changes",
    exact: true,
  });
  await expect(prompt).toBeVisible();
  await expect(prompt.getByRole("button", { name: "Stay" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(prompt).toBeHidden();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Unsaved draft",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await prompt.getByRole("button", { name: "Stay" }).click();
  await page.getByRole("button", { name: /Code task runner/ }).click();
  await prompt.getByRole("button", { name: "Stay" }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Unsaved draft",
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  // Visibility includes the entry fade; axe must measure the settled palette.
  await expect
    .poll(() => prompt.evaluate((el) => getComputedStyle(el).opacity))
    .toBe("1");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
  await prompt.getByRole("button", { name: "Leave" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Create agent", exact: true }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("");
});

test("agent drafts survive sidebar, back and reload cancellation, then save without prompting", async ({
  page,
}) => {
  await signIn(page, "/agents");
  await page.getByRole("cell", { name: /Deep researcher/ }).click();
  await page
    .getByRole("region", { name: "Agent details" })
    .getByRole("link", { name: "Open", exact: true })
    .click();
  await expect(page).toHaveURL(/\/agents\/agent_researcher00000000001$/);
  const editUrl = page.url();
  const name = page.getByLabel("Name", { exact: true });
  await name.fill("Kept draft");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Memory stores", exact: true })
    .click();
  const prompt = page.getByRole("dialog", {
    name: "Unsaved changes",
    exact: true,
  });
  await prompt.getByRole("button", { name: "Stay" }).click();
  await expect(page).toHaveURL(editUrl);
  await expect(name).toHaveValue("Kept draft");
  await page.evaluate(() => history.back());
  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: "Stay" }).click();
  await expect(page).toHaveURL(editUrl);
  await expect(name).toHaveValue("Kept draft");
  const unloading = page.waitForEvent("dialog");
  const reload = page.reload({ timeout: 3000 }).catch(() => null);
  const nativePrompt = await unloading;
  expect(nativePrompt.type()).toBe("beforeunload");
  await nativePrompt.dismiss();
  await reload;
  await expect(name).toHaveValue("Kept draft");
  await page
    .getByRole("button", { name: "Save new version", exact: true })
    .click();
  await expect(page).toHaveURL(/agents\/agent_researcher00000000001$/);
  await expect(prompt).toBeHidden();
  await expect(
    page.getByRole("heading", { name: "Kept draft", exact: true }),
  ).toBeVisible();
});

test("clean view changes leave freely; invalid raw drafts guard history Leave and sidebar navigation", async ({
  page,
}) => {
  await signIn(page, "/agents");
  await page.getByRole("cell", { name: /Deep researcher/ }).click();
  await page
    .getByRole("region", { name: "Agent details" })
    .getByRole("link", { name: "Open", exact: true })
    .click();
  await expect(page).toHaveURL(/agents\/agent_researcher00000000001$/);
  await page.getByRole("radio", { name: "raw", exact: true }).click();
  await page.getByRole("radio", { name: "rendered", exact: true }).click();
  await page.getByRole("button", { name: "sessions", exact: true }).click();
  await expect(page).toHaveURL(/tab=sessions$/);
  await page
    .getByRole("button", { name: "configuration", exact: true })
    .click();
  await expect(page).toHaveURL(/agents\/agent_researcher00000000001$/);
  await page.getByRole("radio", { name: "raw", exact: true }).click();
  await page.getByLabel("Raw agent config").fill("{");
  await page.evaluate(() => history.back());
  const prompt = page.getByRole("dialog", {
    name: "Unsaved changes",
    exact: true,
  });
  await prompt.getByRole("button", { name: "Leave" }).click();
  await expect(page).toHaveURL(/tab=sessions$/);
  await page.evaluate(() => history.forward());
  await expect(page).toHaveURL(/agents\/agent_researcher00000000001$/);
  await page.getByLabel("Name", { exact: true }).fill("Sidebar draft");
  await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link", { name: "Memory stores", exact: true })
    .click();
  await prompt.getByRole("button", { name: "Leave" }).click();
  await expect(page).toHaveURL(/\/memory-stores$/);
});
