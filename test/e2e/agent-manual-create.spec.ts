import { expect, test } from "@playwright/test";
import YAML from "yaml";
import { signIn } from "./sign-in";
import { grantDashboardModelDiscovery } from "./dashboard-fixture";

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18080/__reset");
});

test("directory creation has the workspace navigation, six starters, collapsible configuration and sticky actions", async ({
  page,
}) => {
  await signIn(page, "/workspaces/default/agents");
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  for (const [name, href] of [
    ["Memory", "/workspaces/default/memory-stores"],
    ["Credential vaults", "/workspaces/default/vaults"],
  ]) {
    const link = nav.getByRole("link", { name, exact: true });
    await expect(link).toHaveAttribute("href", href);
    await link.click();
    await expect(page).toHaveURL(new RegExp(href + "$"));
  }
  await nav.getByRole("link", { name: "Agents", exact: true }).click();
  await page.getByRole("link", { name: "Create agent", exact: true }).click();
  await expect(page).toHaveURL(/\/agents\/new$/);
  await expect(
    page.getByRole("navigation", { name: "Breadcrumb" }),
  ).toContainText("New agent");
  const point = page.getByRole("button", { name: /Starting point/ });
  const save = page.getByRole("button", { name: "Create agent", exact: true });
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Untitled agent",
  );
  await expect(page.getByRole("button", { name: "Generate" })).toBeDisabled();
  await expect(
    page.getByRole("radio", { name: "Describe your agent" }),
  ).toBeChecked();
  const sections = ["Tools", "Skills", "Multiagent"];
  for (const title of sections) {
    const section = page.getByRole("button", { name: title, exact: true });
    await expect(section).toHaveAttribute("aria-expanded", "false");
    await section.click();
    await expect(section).toHaveAttribute("aria-expanded", "true");
    await section.click();
  }
  const description = page.getByRole("textbox", {
    name: "Describe your agent",
  });
  await description.fill("Keep this unsent description");
  await page.getByRole("radio", { name: "Template" }).check();
  await page
    .getByRole("button", { name: "Field monitor", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Unsaved changes" })
    .getByRole("button", { name: "Stay" })
    .click();
  await page.getByRole("radio", { name: "Describe your agent" }).check();
  await expect(description).toHaveValue("Keep this unsent description");
  await description.fill("");
  await point.click();
  await expect(
    page.getByRole("textbox", { name: "Describe your agent" }),
  ).toBeHidden();
  await point.click();
  await page.getByRole("radio", { name: "Describe your agent" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Template" })).toBeChecked();
  let writes = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/proxy/v1/agents")) writes++;
  });
  for (const title of [
    "Blank agent",
    "Deep researcher",
    "Structured extractor",
    "Field monitor",
    "Support agent",
    "Incident commander",
  ]) {
    const card = page.getByRole("button", { name: title, exact: true });
    await card.click();
    await expect(point).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
      title === "Blank agent" ? "Untitled agent" : title,
    );
    await point.click();
    await expect(card).toHaveAttribute("aria-pressed", "true");
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
  await page.evaluate(() => window.scrollTo(0, 0));
  const first = await save.boundingBox();
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  await expect
    .poll(async () => Math.abs((await save.boundingBox())!.y - first!.y))
    .toBeLessThan(2);
  await expect(save).toBeInViewport();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Unsaved changes" })
    .getByRole("button", { name: "Leave" })
    .click();
  await expect(page).toHaveURL(/\/agents$/);
  expect(writes).toBe(0);
});

test("a starter uses the current Raw model and preserves invalid input for correction", async ({
  page,
}) => {
  await grantDashboardModelDiscovery(page);
  await signIn(page, "/workspaces/default/agents/new?model=deepseek-flash");
  await page.getByRole("radio", { name: "raw", exact: true }).click();
  const editor = page.getByLabel("Raw agent config");
  const draft = YAML.parse(await editor.inputValue());
  expect(draft.model.id).toBe("deepseek-flash");
  await page.getByRole("radio", { name: "Template" }).check();
  const card = page.getByRole("button", { name: "Support agent", exact: true });
  await editor.fill("model: [");
  await card.click();
  await expect(editor).toHaveAttribute("aria-invalid", "true");
  await expect(editor).toHaveValue("model: [");
  await expect(
    page.getByRole("dialog", { name: "Unsaved changes" }),
  ).toBeHidden();
  await editor.fill(YAML.stringify({ ...draft, model: "minimax-m3" }));
  await card.click();
  await page
    .getByRole("dialog", { name: "Unsaved changes" })
    .getByRole("button", { name: "Leave" })
    .click();
  const template = YAML.parse(await editor.inputValue());
  expect(template.name).toBe("Support agent");
  expect(template.model.id).toBe("minimax-m3");
  await page.getByRole("radio", { name: "rendered" }).click();
  await expect(
    page.getByRole("button", { name: "Model", exact: true }),
  ).toHaveAttribute("data-model", "minimax-m3");
});

test("a template can replace a rendered draft with an unfinished custom tool after confirmation", async ({
  page,
}) => {
  await signIn(page, "/workspaces/default/agents/new?model=deepseek-flash");
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await page.getByRole("button", { name: "Add custom tool" }).click();
  const tool = page.locator('[data-tool-type="custom"]');
  await tool.getByText("Definition", { exact: true }).click();
  const schema = tool.getByLabel("Input schema");
  await schema.fill("{");
  await page.getByRole("radio", { name: "Template" }).check();
  const card = page.getByRole("button", { name: "Support agent", exact: true });
  const dialog = page.getByRole("dialog", { name: "Unsaved changes" });
  await card.click();
  await dialog.getByRole("button", { name: "Stay" }).click();
  await expect(schema).toHaveValue("{");
  await card.click();
  await dialog.getByRole("button", { name: "Leave" }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Support agent",
  );
  await expect(
    page.getByRole("button", { name: "Model", exact: true }),
  ).toHaveAttribute("data-model", "deepseek-flash");
  await expect(
    page.getByRole("button", { name: "Create agent", exact: true }),
  ).toBeEnabled();
});

test("Generate retries a failed draft, Raw round-trips YAML and JSON, and only explicit creation writes", async ({
  page,
  context,
}) => {
  await grantDashboardModelDiscovery(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:3100",
  });
  let generations = 0,
    writes = 0;
  await page.route(
    "**/api/organizations/default/proxy/v1/messages*",
    async (route) => {
      generations++;
      expect(route.request().postDataJSON().model).toBe("minimax-m3");
      if (generations === 1) {
        await route.fulfill({
          status: 503,
          json: { error: { type: "api_error", message: "Draft unavailable" } },
        });
        return;
      }
      await route.fulfill({
        json: {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                name: "Weekly summary",
                description: "Summarize weekly changes.",
                system: "List changes with their sources.",
              }),
            },
          ],
          usage: { input_tokens: 8, output_tokens: 12 },
        },
      });
    },
  );
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/proxy/v1/agents")) writes++;
  });
  await signIn(page, "/workspaces/default/agents/new");
  await page.getByRole("radio", { name: "raw", exact: true }).click();
  const original = page.getByLabel("Raw agent config");
  const base = YAML.parse(await original.inputValue());
  const fetchConfig = { name: "web_fetch", type: "web_fetch", enabled: false };
  await original.fill(
    YAML.stringify({
      ...base,
      model: { id: "minimax-m3", effort: "low" },
      tools: [{ type: "agent_toolset_20260401", configs: [fetchConfig] }],
    }),
  );
  await page
    .getByRole("textbox", { name: "Describe your agent" })
    .fill("Summarize this week's changes.");
  const generate = page.getByRole("button", { name: "Generate", exact: true });
  await generate.click();
  await page
    .getByRole("dialog", { name: "Unsaved changes" })
    .getByRole("button", { name: "Leave" })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Draft unavailable" }),
  ).toBeVisible();
  await generate.click();
  await page
    .getByRole("dialog", { name: "Unsaved changes" })
    .getByRole("button", { name: "Leave" })
    .click();
  await expect(original).toHaveValue(/Weekly summary/);
  expect(
    YAML.parse(await original.inputValue()).tools[0].configs,
  ).toContainEqual(fetchConfig);
  await page.getByRole("radio", { name: "rendered" }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Weekly summary",
  );
  const point = page.getByRole("button", { name: /Starting point/ });
  await point.click();
  await page.getByRole("radio", { name: "Template" }).check();
  await page
    .getByRole("button", { name: "Field monitor", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Unsaved changes" })
    .getByRole("button", { name: "Stay" })
    .click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Weekly summary",
  );
  await page.getByRole("radio", { name: "raw", exact: true }).click();
  const editor = page.getByLabel("Raw agent config");
  const yaml = await editor.inputValue();
  expect(YAML.parse(yaml).tools[0].configs).toContainEqual(fetchConfig);
  await page.getByRole("button", { name: "Copy configuration" }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        navigator.clipboard.readText().then((t) => t.replaceAll("\r\n", "\n")),
      ),
    )
    .toBe(yaml.replaceAll("\r\n", "\n"));
  await page.getByRole("button", { name: "Config format: YAML" }).click();
  await page.getByRole("menuitem", { name: "JSON" }).click();
  expect(JSON.parse(await editor.inputValue())).toEqual(YAML.parse(yaml));
  await editor.fill("{");
  await page.getByRole("radio", { name: "rendered" }).click();
  await expect(editor).toHaveAttribute("aria-invalid", "true");
  await editor.fill(
    JSON.stringify({
      ...YAML.parse(yaml),
      name: "Edited weekly summary",
      model: {
        id: "minimax-m3",
        effort: { type: "medium" },
        inference_geo: "global",
      },
    }),
  );
  await page.getByRole("radio", { name: "rendered" }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Edited weekly summary",
  );
  expect(writes).toBe(0);
  await page.getByRole("button", { name: "Create agent", exact: true }).click();
  await expect(page).toHaveURL(/\/agents\/agent_mock/);
  await page.getByRole("radio", { name: "raw" }).click();
  expect(JSON.parse(await editor.inputValue()).model).toEqual({
    id: "minimax-m3",
    effort: "medium",
    inference_geo: "global",
  });
  expect({ generations, writes }).toEqual({ generations: 2, writes: 1 });
});
