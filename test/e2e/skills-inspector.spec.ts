import { expect, test } from "@playwright/test";
import { signIn } from "./sign-in";

const SKILL = "skill_reportwriter0000001";
test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18080/__reset");
});

test("skill inspector preserves the list, history and focus", async ({
  page,
}) => {
  await signIn(page, "/workspaces/default/skills");
  const row = page.getByRole("row").filter({ hasText: "Weekly report writer" });
  await row
    .getByRole("cell", { name: "Weekly report writer", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "Skill details" });
  await expect(panel).toHaveAttribute("data-skill-id", SKILL);
  for (const version of [
    "skillver_rw2000000000001",
    "skillver_rw1000000000001",
  ]) {
    await expect(panel.getByText(version, { exact: true })).toBeVisible();
  }
  await expect(page).toHaveURL(`/workspaces/default/skills?skill=${SKILL}`);
  await expect(row).toBeVisible();
  await panel.getByText("API", { exact: true }).click();
  await expect(
    panel.getByRole("radio", { name: "API", exact: true }),
  ).toBeChecked();
  await expect(panel.locator("pre")).toContainText(
    '"display_name": "Weekly report writer"',
  );
  await panel.getByRole("button", { name: "Close details" }).click();
  await expect(panel).toBeHidden();
  await expect(row).toBeFocused();
  await page.goBack();
  await expect(panel).toBeVisible();
  await page.reload();
  await expect(
    panel.getByRole("heading", { name: "Weekly report writer" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
});

test("exact lookup shows a missing ID inline and Enter opens a matching skill", async ({
  page,
}) => {
  await signIn(page, "/workspaces/default/skills");
  const lookup = page.getByRole("textbox", { name: "Find skill by ID" });
  await lookup.fill("missing-skill");
  await lookup.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Skill not found" }),
  ).toBeVisible();
  const panel = page.getByRole("region", { name: "Skill details" });
  await expect(panel).toBeHidden();
  await page.getByRole("button", { name: "Clear search" }).last().click();
  await expect(
    page.getByRole("cell", { name: "Weekly report writer", exact: true }),
  ).toBeVisible();
  await lookup.fill("xlsx");
  await lookup.press("Enter");
  await expect(panel).toHaveAttribute("data-skill-id", "xlsx");
  await expect(panel.getByRole("button", { name: "Update" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(lookup).toBeFocused();
});

test("inspector navigation and resizing work with mouse and keyboard", async ({
  page,
}) => {
  await signIn(page, `/workspaces/default/skills?skill=${SKILL}`);
  const panel = page.getByRole("region", { name: "Skill details" });
  await expect(
    panel.getByRole("heading", { name: "Weekly report writer" }),
  ).toBeVisible();
  const next = panel.getByRole("button", { name: "Next skill" });
  const previous = panel.getByRole("button", { name: "Previous skill" });
  if (await next.isEnabled()) await next.click();
  else await previous.click();
  await expect(panel).toHaveAttribute("data-skill-id", "xlsx");
  const resize = panel.getByRole("separator", { name: "Resize panel" });
  await resize.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(resize).toHaveAttribute("aria-valuenow", "592");
  const bounds = await resize.boundingBox();
  await page.mouse.move(bounds!.x + 6, bounds!.y + 100);
  await page.mouse.down();
  await page.mouse.move(bounds!.x - 58, bounds!.y + 100);
  await page.mouse.up();
  await expect(resize).toHaveAttribute("aria-valuenow", "656");
  await resize.dblclick();
  await expect(resize).toHaveAttribute("aria-valuenow", "560");
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileBounds = await panel.boundingBox();
  const header = await page.locator("[data-console-header]").boundingBox();
  expect(mobileBounds!.x).toBeGreaterThanOrEqual(48);
  expect(mobileBounds!.x + mobileBounds!.width).toBeLessThanOrEqual(390);
  expect(mobileBounds!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
  await expect(
    panel.getByRole("button", { name: "Close details" }),
  ).toBeInViewport();
});
