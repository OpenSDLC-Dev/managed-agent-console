import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator("form[data-hydrated]").waitFor();
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/agents$/);
}

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18080/__reset");
});

test("create an agent through the rendered form", async ({ page }) => {
  await signIn(page);
  await page.getByRole("button", { name: "Create agent" }).click();
  await expect(page).toHaveURL(/\/agents\/new$/);

  await page.getByLabel("Name").fill("Deploy helper");
  await page.getByLabel("Model", { exact: true }).fill("claude-opus-4-8");
  await page.getByLabel("bash policy").click();
  await page.getByRole("option", { name: "always ask" }).click();
  await page.getByRole("checkbox", { name: /Excel spreadsheets/ }).check();

  await page.getByRole("button", { name: "Create agent", exact: true }).click();
  await expect(page).toHaveURL(/\/agents\/agent_mock/);
  await expect(
    page.getByRole("heading", { name: "Deploy helper" }),
  ).toBeVisible();
  // The saved config carries the ask policy and the picked skill.
  await expect(page.getByText("always_ask")).toBeVisible();
  await expect(page.getByText('"skill_id": "xlsx"')).toBeVisible();
});

test("create an agent from a starter template", async ({ page }) => {
  await signIn(page);
  await page.goto("/agents/new");

  // The template seeds the whole form through the wire parse path.
  await page.getByRole("button", { name: /Code task runner/ }).click();
  await expect(page.getByLabel("Name")).toHaveValue("Code task runner");
  await expect(page.getByLabel("bash policy")).toContainText("always ask");

  // The equivalent-curl block teaches the wire shape with placeholders only.
  await page.getByText("Equivalent API request").click();
  await expect(page.getByTestId("curl-block")).toContainText(
    'curl -X POST "$PLATFORM_BASE_URL/v1/agents"',
  );
  await expect(page.getByTestId("curl-block")).toContainText(
    "x-api-key: $PLATFORM_API_KEY",
  );

  await page.getByRole("button", { name: "Create agent", exact: true }).click();
  await expect(page).toHaveURL(/\/agents\/agent_mock/);
  await expect(
    page.getByRole("heading", { name: "Code task runner" }),
  ).toBeVisible();
  await expect(page.getByText("always_ask")).toBeVisible();
});

test("edit through the raw tab with the YAML toggle", async ({ page }) => {
  await signIn(page);
  await page.getByRole("cell", { name: /Deep researcher/ }).click();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page).toHaveURL(/\/edit$/);

  await page.getByRole("button", { name: "raw" }).click();
  await page.getByRole("button", { name: "YAML" }).click();
  const editor = page.getByLabel("Raw agent config");
  await expect(editor).toHaveValue(/name: Deep researcher/);

  const yaml = [
    "name: Deep researcher",
    "model:",
    "  id: claude-opus-4-8",
    "system: You are a careful researcher.",
    "description: Edited via YAML.",
    "tools:",
    "  - type: agent_toolset_20260401",
    "mcp_servers: []",
    "skills: []",
  ].join("\n");
  await editor.fill(yaml);
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page).toHaveURL(/\/agents\/agent_researcher00000000001$/);
  await expect(page.getByText("Edited via YAML.")).toBeVisible();
});

test("stale-version saves surface the 409 conflict", async ({ context }) => {
  const pageA = await context.newPage();
  await signIn(pageA);
  await pageA.goto("/agents/agent_researcher00000000001/edit");
  await expect(pageA.getByLabel("Name")).toHaveValue("Deep researcher");

  const pageB = await context.newPage();
  await pageB.goto("/agents/agent_researcher00000000001/edit");
  await expect(pageB.getByLabel("Name")).toHaveValue("Deep researcher");

  // A saves first (v bump), then B saves against the stale version.
  await pageA.getByLabel("Description").fill("A's change");
  await pageA.getByRole("button", { name: "Save changes" }).click();
  await expect(pageA).toHaveURL(/\/agents\/agent_researcher00000000001$/);

  await pageB.getByLabel("Description").fill("B's change");
  await pageB.getByRole("button", { name: "Save changes" }).click();
  await expect(
    pageB.getByText(/Someone else updated this agent/),
  ).toBeVisible();
});

test("platform validation errors surface inline from the raw tab", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/agents/new");
  await page.getByRole("button", { name: "raw" }).click();
  const editor = page.getByLabel("Raw agent config");
  await editor.fill(
    JSON.stringify({ name: "X", model: "claude-sonnet-4-8", bogus: 1 }),
  );
  await page.getByRole("button", { name: "Create agent", exact: true }).click();
  await expect(page.getByText('unknown field "bogus"')).toBeVisible();
});

test("archive an agent from its detail page", async ({ page }) => {
  await signIn(page);
  await page.getByRole("cell", { name: /General task agent/ }).click();
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await page.getByRole("button", { name: "Archive agent" }).click();
  await expect(page.getByText("archived", { exact: true })).toBeVisible();
});
