import { expect, test } from "@playwright/test";
import { signIn } from "./sign-in";

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18080/__reset");
});

test("create an agent through the rendered form", async ({ page }) => {
  await signIn(page, "/agents");
  await page.getByRole("button", { name: "Create agent" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  await page.getByLabel("Name").fill("Deploy helper");
  await page.getByLabel("Model", { exact: true }).fill("claude-opus-4-8");
  await page.getByRole("button", { name: /Tool permissions/ }).click();
  await page.getByLabel("bash policy").click();
  await page.getByRole("option", { name: "always ask" }).click();
  await page.getByRole("combobox", { name: "Add skill" }).click();
  await page.getByRole("option", { name: /Excel spreadsheets/ }).click();

  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create agent", exact: true })
    .click();
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
  await page.getByRole("button", { name: /Tool permissions/ }).click();
  // The trigger renders the wire value verbatim.
  await expect(page.getByLabel("bash policy")).toContainText("always_ask");

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
  await signIn(page, "/agents");
  await page.getByRole("cell", { name: /Deep researcher/ }).click();
  await page
    .getByRole("region", { name: "Agent details" })
    .getByRole("link", { name: "Open", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page).toHaveURL(/\/edit$/);

  await page.getByRole("radio", { name: "raw" }).click();
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
  await page.getByRole("radio", { name: "raw" }).click();
  const editor = page.getByLabel("Raw agent config");
  await editor.fill(
    JSON.stringify({ name: "X", model: "claude-sonnet-4-8", bogus: 1 }),
  );
  await page.getByRole("button", { name: "Create agent", exact: true }).click();
  await expect(page.getByText('unknown field "bogus"')).toBeVisible();
});

test("archive an agent from its detail page", async ({ page }) => {
  await signIn(page, "/agents");
  await page.getByRole("cell", { name: /General task agent/ }).click();
  await page
    .getByRole("region", { name: "Agent details" })
    .getByRole("link", { name: "Open", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "General task agent" }),
  ).toBeVisible();
  await page
    .getByRole("main")
    .getByRole("button", { name: "More actions" })
    .click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await page.getByRole("button", { name: "Archive agent" }).click();
  await expect(page.getByText("archived", { exact: true })).toBeVisible();
});

test("structured custom tools and MCP settings survive Raw and save", async ({
  page,
}) => {
  await signIn(page, "/agents/new");
  await page.getByLabel("Name", { exact: true }).fill("Support");
  await page.getByRole("button", { name: "Add custom tool" }).click();
  const tool = page.locator('[data-tool-type="custom"]');
  await tool.getByText("Definition", { exact: true }).click();
  await tool.getByLabel("Name", { exact: true }).fill("lookup_order");
  await tool
    .getByLabel("Description", { exact: true })
    .fill("Look up an order.");
  await tool.getByLabel("Input schema").fill("{");
  await expect(page.getByRole("radio", { name: "raw" })).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Create agent", exact: true }),
  ).toBeDisabled();
  await tool
    .getByLabel("Input schema")
    .fill('{"type":"object","properties":{"id":{"type":"string"}}}');
  await page.getByRole("button", { name: "Add MCP server" }).click();
  await page.getByLabel("Server name").fill("orders");
  await page.getByLabel("Server URL").fill("https://example.test/mcp");
  await page
    .locator('[data-tool-type="mcp"]')
    .getByText("Tool permissions", { exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "orders default permission policy" })
    .click();
  await page.getByRole("option", { name: "Always ask" }).click();
  await page.getByRole("radio", { name: "raw" }).click();
  const config = JSON.parse(
    await page.getByLabel("Raw agent config").inputValue(),
  );
  expect(config.tools).toContainEqual({
    type: "mcp_toolset",
    mcp_server_name: "orders",
    default_config: { permission_policy: { type: "always_ask" } },
  });
  await page.getByRole("radio", { name: "rendered" }).click();
  const submitted = page.waitForRequest(
    (r) => r.method() === "POST" && r.url().endsWith("/api/platform/v1/agents"),
  );
  await page.getByRole("button", { name: "Create agent", exact: true }).click();
  expect((await submitted).postDataJSON()).toEqual(config);
  await expect(page).toHaveURL(new RegExp("agents/agent_mock"));
});

test("schema indentation keeps the modal open and Escape then Tab releases focus", async ({
  page,
}) => {
  await signIn(page, "/agents");
  await page.getByRole("button", { name: "Create agent", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create agent" });
  await dialog.getByRole("button", { name: "Add custom tool" }).click();
  const tool = dialog.locator('[data-tool-type="custom"]');
  await tool.getByText("Definition", { exact: true }).click();
  const schema = tool.getByLabel("Input schema");
  await schema.fill("{}");
  await schema.press("ArrowLeft");
  await schema.press("Tab");
  await expect(schema).toHaveValue("{  }");
  await schema.press("ControlOrMeta+z");
  await expect(schema).toHaveValue("{}");
  await schema.press("ControlOrMeta+Shift+z");
  await expect(schema).toHaveValue("{  }");
  await expect(schema).toBeFocused();
  await schema.press("Escape");
  await expect(dialog).toBeVisible();
  await schema.press("Tab");
  await expect(schema).not.toBeFocused();
  await expect(dialog).toBeVisible();
  await schema.focus();
  await schema.press("ControlOrMeta+A");
  await schema.press("ArrowRight");
  await schema.press("Tab");
  await expect(schema).toHaveValue("{  }  ");
  await dialog.getByRole("radio", { name: "raw" }).click();
  const raw = JSON.parse(
    await dialog.getByLabel("Raw agent config").inputValue(),
  );
  expect(raw.tools).toContainEqual({
    type: "custom",
    name: "new_tool",
    description: "",
    input_schema: {},
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
