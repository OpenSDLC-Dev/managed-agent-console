import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./sign-in";

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18080/__reset");
});

test("memory creation cancels without navigation and retains drafts after a platform error", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/memory-stores");
  const trigger = page.getByRole("button", {
    name: "Create memory store",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Discard");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL("/memory-stores");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue("");
  await dialog.getByLabel("Name", { exact: true }).fill("Release notes");
  await dialog
    .getByLabel("Description", { exact: true })
    .fill("First line\nSecond line");
  await page.route("**/api/platform/v1/memory_stores", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({
          status: 409,
          json: {
            type: "error",
            error: { type: "conflict_error", message: "Try another name" },
          },
        })
      : route.continue(),
  );
  await dialog
    .getByRole("button", { name: "Create memory store", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText("Try another name");
  await expect(dialog.getByLabel("Description", { exact: true })).toHaveValue(
    "First line\nSecond line",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => dialog.evaluate((el) => getComputedStyle(el).opacity))
    .toBe("1");
  expect(
    (await new AxeBuilder({ page }).include('[role="dialog"]').analyze())
      .violations,
  ).toEqual([]);
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await page.unroute("**/api/platform/v1/memory_stores");
  await dialog.getByLabel("Name", { exact: true }).press("Enter");
  await expect(page).toHaveURL(/\/memory-stores\/memstore_mock/);
  await expect(
    page.getByRole("heading", { name: "Release notes" }),
  ).toBeVisible();
});

test("deployment dialog preserves message and schedule drafts and submits the platform shape", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/deployments");
  const trigger = page.getByRole("button", {
    name: "Create deployment",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name", { exact: true }).fill("Discard");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page).toHaveURL("/deployments");
  await trigger.click();
  await expect(dialog.getByLabel("Name", { exact: true })).toHaveValue("");
  await dialog.getByLabel("Name", { exact: true }).fill("Morning triage");
  await dialog.getByRole("combobox", { name: "Agent", exact: true }).click();
  await page.getByRole("option", { name: /General task agent · v1/ }).click();
  await dialog
    .getByRole("combobox", { name: "Environment", exact: true })
    .click();
  await page.getByRole("option", { name: /byoc-workers/ }).click();
  await dialog
    .getByRole("textbox", { name: "Initial message" })
    .fill("Review changes\nReport failures");
  await dialog.getByRole("radio", { name: "Advanced events" }).check();
  expect(
    JSON.parse(await dialog.getByLabel("Initial events (JSON)").inputValue()),
  ).toEqual([
    { type: "user.message", content: "Review changes\nReport failures" },
  ]);
  await dialog.getByLabel("Initial events (JSON)").fill("{");
  await dialog
    .getByRole("button", { name: "Create deployment", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(
    dialog.getByRole("radio", { name: "Initial message" }),
  ).toBeDisabled();
  await dialog
    .getByLabel("Initial events (JSON)")
    .fill(
      '[{"type":"user.message","content":"Review changes\\nReport failures"}]',
    );
  await dialog.getByRole("radio", { name: "Initial message" }).check();
  await dialog.getByRole("radio", { name: "Schedule", exact: true }).check();
  await dialog.getByRole("button", { name: "Edit cron" }).click();
  await dialog.getByLabel("Cron expression").fill("30 8 * * 1-5");
  await dialog
    .getByRole("combobox", { name: "IANA timezone", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Search timezones" })
    .fill("Shanghai");
  await page.getByRole("option", { name: /Asia\/Shanghai$/ }).click();
  await dialog.getByRole("radio", { name: "Manual", exact: true }).check();
  await dialog.getByRole("radio", { name: "Schedule", exact: true }).check();
  await dialog.getByRole("button", { name: "Edit cron" }).click();
  await expect(dialog.getByLabel("Cron expression")).toHaveValue(
    "30 8 * * 1-5",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await expect
    .poll(() => dialog.evaluate((el) => getComputedStyle(el).opacity))
    .toBe("1");
  expect(
    (await new AxeBuilder({ page }).include('[role="dialog"]').analyze())
      .violations,
  ).toEqual([]);
  const submitted = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      request.url().endsWith("/api/platform/v1/deployments"),
  );
  await dialog
    .getByRole("button", { name: "Create deployment", exact: true })
    .click();
  expect((await submitted).postDataJSON()).toMatchObject({
    initial_events: [
      { type: "user.message", content: "Review changes\nReport failures" },
    ],
    schedule: {
      type: "cron",
      expression: "30 8 * * 1-5",
      timezone: "Asia/Shanghai",
    },
  });
  await expect(page).toHaveURL(/\/deployments\/depl_mock/);
  await expect(
    page.getByRole("heading", { name: "Morning triage" }),
  ).toBeVisible();
});

test("timezone search can cancel, select by keyboard and preserve aliases on edit", async ({
  page,
}) => {
  await signIn(page, "/deployments/depl_weeklyresearch000001/edit");
  const trigger = page.getByRole("combobox", {
    name: "IANA timezone",
    exact: true,
  });
  await trigger.click();
  const search = page.getByRole("combobox", { name: "Search timezones" });
  await search.fill("Shanghai");
  await search.press("Escape");
  await expect(trigger).toContainText("UTC");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await search.fill("US/Eastern");
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(trigger).toContainText("US/Eastern");
  const submitted = page.waitForRequest(
    (req) =>
      req.method() === "POST" &&
      req.url().endsWith("/v1/deployments/depl_weeklyresearch000001"),
  );
  await page.getByRole("button", { name: "Save changes" }).click();
  expect((await submitted).postDataJSON().schedule.timezone).toBe("US/Eastern");
  await expect(page).toHaveURL(/deployments\/depl_weeklyresearch000001$/);
  await page.reload();
  await expect(trigger).toContainText("US/Eastern");
});

test("schedule clock supports AM/PM keyboard changes and preserves midnight on edit", async ({
  page,
}) => {
  await signIn(page, "/deployments/depl_weeklyresearch000001/edit");
  await page.getByLabel("Frequency", { exact: true }).selectOption("Daily");
  const time = page.getByLabel("At", { exact: true });
  await time.fill("12:00");
  await page.getByRole("radio", { name: "AM", exact: true }).check();
  await page.getByRole("radio", { name: "AM", exact: true }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("radio", { name: "PM", exact: true }),
  ).toBeChecked();
  await page.keyboard.press("ArrowLeft");
  await expect(
    page.getByRole("radio", { name: "AM", exact: true }),
  ).toBeChecked();
  await time.fill("13:00");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\/deployments\/depl_weeklyresearch000001$/);
  expect(
    await time.evaluate((el: HTMLInputElement) => el.validity.patternMismatch),
  ).toBe(true);
  await time.fill("12:00");
  await page.setViewportSize({ width: 390, height: 844 });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const submitted = page.waitForRequest(
    (req) =>
      req.method() === "POST" &&
      req.url().endsWith("/v1/deployments/depl_weeklyresearch000001"),
  );
  await page.getByRole("button", { name: "Save changes" }).click();
  expect((await submitted).postDataJSON().schedule.expression).toBe(
    "0 0 * * *",
  );
  await expect(page.getByRole("button", { name: "Save changes" })).toBeHidden();
  await page.reload();
  await expect(time).toHaveValue("12:00");
  await expect(
    page.getByRole("radio", { name: "AM", exact: true }),
  ).toBeChecked();
});
