import { expect, test } from "@playwright/test";
import { signIn } from "./sign-in";

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18080/__reset");
});

test("creates a coordinator with an ordered roster", async ({ page }) => {
  await signIn(page);
  await page.goto("/agents/new");
  await page.getByLabel("Name").fill("Coordinator");
  await page.getByRole("button", { name: "Enable coordinator" }).click();
  await page.getByLabel("Agent").selectOption("agent_taskrunner0000000001");
  await page.getByRole("button", { name: "Add member" }).click();
  await page.getByRole("button", { name: "Create agent", exact: true }).click();

  await expect(page).toHaveURL(/\/agents\/agent_mock/);
  const roster = page.getByRole("heading", { name: "Multiagent roster" });
  await expect(roster).toBeVisible();
  await expect(page.getByText("This coordinator (self)")).toBeVisible();
  await expect(
    page.getByText("agent_taskrunner0000000001", { exact: true }),
  ).toBeVisible();
});

test("switches to a child trace and archives the idle child", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/sessions/sesn_research0000000000001");

  const child = page.locator('[data-thread-id="sthr_taskrunnerresearch0001"]');
  await expect(child).toHaveAttribute("data-thread-status", "idle");
  await child.getByRole("button").first().click();
  await expect(page.getByTestId("stream-state")).toHaveAttribute(
    "data-state",
    "live",
  );
  await expect(
    page.getByText("General task agent receives work from the coordinator."),
  ).toBeVisible();
  await expect(page.getByTestId("event-row")).toHaveCount(2);

  await page
    .getByRole("button", { name: "Archive thread General task agent" })
    .click();
  await page.getByRole("button", { name: "Archive thread" }).click();
  await expect(child).toHaveAttribute("data-thread-status", "terminated");
});
