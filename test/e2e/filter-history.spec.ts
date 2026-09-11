import { expect, test } from "@playwright/test";
import { signIn } from "./sign-in";
test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18080/__reset");
});
for (const route of ["agents", "sessions", "memory-stores"]) {
  test(`${route} restores dates across reload and browser history`, async ({
    page,
  }) => {
    await signIn(page, `/${route}?created=2026-08-01~2026-08-02`);
    const trigger = page.getByLabel("Created filter");
    await expect(trigger).toHaveAttribute("data-value", "custom");
    await trigger.click();
    await page
      .getByRole("option", { name: "Last 7 days", exact: true })
      .click();
    await expect(page).toHaveURL(/created=7d/);
    await page.reload();
    await expect(trigger).toHaveAttribute("data-value", "7d");
    await page.goBack();
    await expect(trigger).toHaveAttribute("data-value", "custom");
    await trigger.click();
    await expect(
      page.getByRole("textbox", { name: "Start", exact: true }),
    ).toHaveValue("2026-08-01");
    await page.keyboard.press("Escape");
    await page.goForward();
    await expect(trigger).toHaveAttribute("data-value", "7d");
    await page.getByRole("button", { name: "Reset", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${route}$`));
    await expect(trigger).toHaveAttribute("data-value", "all");
  });
}
test("session choices restore after visiting a detail and returning", async ({
  page,
}) => {
  await signIn(
    page,
    "/sessions?status=idle&agent=agent_general000000000001&order=asc",
  );
  await expect(page.getByLabel("Status filter")).toHaveAttribute(
    "data-value",
    "idle",
  );
  await expect(
    page.getByRole("button", { name: "Created: oldest first" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Find session by ID" })
    .fill("sesn_research0000000000001");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page).toHaveURL(/sessions\/sesn_research0000000000001$/);
  await page.goBack();
  await expect(page.getByLabel("Status filter")).toHaveAttribute(
    "data-value",
    "idle",
  );
  await expect(
    page.getByRole("button", { name: "Created: oldest first" }),
  ).toBeVisible();
});
test("deployment status and agent filters survive reload and reset", async ({
  page,
}) => {
  await signIn(
    page,
    "/deployments?status=paused&agent=agent_researcher00000000001",
  );
  await expect(page.getByLabel("Deployment status")).toContainText("Paused");
  await page.reload();
  await expect(page.getByLabel("Deployment status")).toContainText("Paused");
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(page).toHaveURL(/\/deployments$/);
  await expect(page.getByLabel("Agent filter")).toContainText("All agents");
});
