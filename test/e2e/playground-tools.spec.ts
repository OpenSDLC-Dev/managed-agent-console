import { expect, test, type Page } from "@playwright/test";
import {
  clientCalls,
  disablePlaygroundStreaming,
  grantToolModels,
  hostedResults,
  serveToolReply,
  toolModels,
  toolTemplates,
} from "./playground-tools-fixture";
import { signIn } from "./sign-in";

test.beforeEach(async ({ page, request }) => {
  expect((await request.post("http://127.0.0.1:18080/__reset")).ok()).toBe(
    true,
  );
  await grantToolModels(page);
  await signIn(page, "/playground");
});

async function selectAlias(page: Page, name: string) {
  await page.getByRole("combobox", { name: "Model", exact: true }).click();
  await page.getByRole("option", { name, exact: true }).click();
}

async function readFormJSON(page: Page) {
  const main = page.getByRole("main");
  await main.getByText("Code", { exact: true }).click();
  await main.getByLabel("Code language").selectOption("JSON");
  const json = JSON.parse(
    await main.getByRole("textbox", { name: "JSON request code" }).inputValue(),
  );
  await main.getByText("Form", { exact: true }).click();
  return json;
}

async function addTool(page: Page, label: string) {
  await page
    .getByRole("form", { name: "Build your request" })
    .getByRole("button", { name: "Add", exact: true })
    .click();
  await page.getByRole("menuitem", { name: label, exact: true }).click();
  await page.locator('[role="menu"]').waitFor({ state: "detached" });
}

for (const model of toolModels) {
  test(`${model.display_name} offers all five named tools with usable request definitions`, async ({
    page,
  }) => {
    const sent = await serveToolReply(page, []);
    await selectAlias(page, model.display_name);
    const add = page.getByRole("button", { name: "Add", exact: true });
    await add.click();
    const group = page.getByRole("group", { name: "Tools", exact: true });
    await expect(group.getByRole("menuitem")).toHaveCount(6);
    await expect(
      group.getByRole("menuitem", { name: "Custom tool", exact: true }),
    ).toBeEnabled();
    await page.keyboard.press("Escape");
    await page.locator('[role="menu"]').waitFor({ state: "detached" });
    for (const entry of toolTemplates) {
      await addTool(page, entry.label);
      await add.click();
      await expect(
        group.getByRole("menuitem", {
          name: new RegExp(entry.label + ".*Added"),
        }),
      ).toBeDisabled();
      await page.keyboard.press("Escape");
      await page.locator('[role="menu"]').waitFor({ state: "detached" });
    }
    const body = await readFormJSON(page);
    expect(body.model).toBe(model.id);
    expect(body.tools).toHaveLength(5);
    for (const entry of toolTemplates) {
      const server =
        model.id === "deepseek-flash" &&
        (entry.name === "web_search" || entry.name === "web_fetch");
      const name = server
        ? entry.name === "web_search"
          ? "deepseek_web_search"
          : "deepseek_read_url"
        : entry.name;
      const declaration = body.tools.find(
        (tool: { name: string }) => tool.name === name,
      );
      if (server) expect(declaration).toEqual({ name, type: name });
      else {
        expect(declaration).toMatchObject({
          name,
          input_schema: { type: "object", properties: expect.any(Object) },
        });
        expect(declaration).not.toHaveProperty("type");
      }
    }
    expect(sent).toEqual([]);
  });
}

test("both template pages preserve model and view and load real requests without running", async ({
  page,
}) => {
  const sent = await serveToolReply(page, []);
  await selectAlias(page, "Kimi K3");
  const main = page.getByRole("main");
  const response = main.getByRole("region", { name: "Response" });
  const cards = response.getByRole("list");
  const pager = response.getByRole("navigation", { name: "Template pages" });
  await expect(cards.getByRole("button")).toHaveCount(6);
  await expect(cards).toHaveAttribute("data-template-page", "1");
  for (const entry of toolTemplates) {
    if (entry.id === "browser") {
      await pager.getByRole("button", { name: "More" }).click();
      await expect(cards.getByRole("button")).toHaveCount(1);
    }
    const card = cards.getByRole("button", { name: entry.title, exact: true });
    await card.click();
    await expect(card).toHaveAttribute("aria-pressed", "true");
    await expect(card).toBeFocused();
    const body = await readFormJSON(page);
    expect(body).toMatchObject({
      model: "kimi-k3",
      system: expect.stringMatching(/\S/),
      messages: [{ role: "user", content: expect.stringMatching(/\S/) }],
      tools: [{ name: entry.name, input_schema: { type: "object" } }],
    });
  }
  await pager.getByRole("button", { name: "Previous" }).click();
  await expect(cards).toHaveAttribute("data-template-page", "1");
  await expect(
    main.getByRole("button", { name: "browser", exact: true }),
  ).toBeVisible();
  expect(sent).toEqual([]);
});

test("client calls accept individual results, error status and a screenshot in the next request", async ({
  page,
}) => {
  const sent = await serveToolReply(page, clientCalls);
  await selectAlias(page, "Kimi K3");
  await disablePlaygroundStreaming(page);
  await addTool(page, "Computer use");
  const zoom = page.getByRole("switch", { name: "Zoom", exact: true });
  await expect(zoom).toBeChecked();
  await zoom.click();
  await addTool(page, "Browser use");
  for (const name of [
    "JavaScript execution",
    "File upload",
    "Console reads",
    "Network reads",
  ]) {
    const option = page.getByRole("switch", { name, exact: true });
    await expect(option).not.toBeChecked();
    await option.click();
  }
  const edited = await readFormJSON(page);
  expect(
    edited.tools.find((tool: { name: string }) => tool.name === "computer")
      .input_schema.properties.action.enum,
  ).not.toContain("zoom");
  expect(
    edited.tools.find((tool: { name: string }) => tool.name === "browser")
      .input_schema.properties.action.enum,
  ).toEqual(
    expect.arrayContaining([
      "javascript_exec",
      "file_upload",
      "read_console",
      "read_network",
    ]),
  );
  await page
    .getByRole("textbox", { name: "Prompt", exact: true })
    .fill("Inspect the example page");
  const run = page.getByRole("button", { name: "Run prompt" });
  await run.click();
  const response = page.getByRole("region", { name: "Response" });
  for (const call of clientCalls) {
    const args = response.getByLabel("Arguments for " + call.name);
    await expect(args).toBeVisible();
    expect(JSON.parse(await args.innerText())).toEqual(call.input);
    const toggle = response.getByRole("button", {
      name: "Tool use " + call.name,
    });
    await toggle.press("Enter");
    await expect(args).toBeHidden();
    await toggle.press("Enter");
    await expect(args).toBeVisible();
  }
  await response.getByRole("button", { name: "Add to messages" }).click();
  const screen = page.getByRole("textbox", {
    name: "Tool result computer",
    exact: true,
  });
  const browser = page.getByRole("textbox", {
    name: "Tool result browser",
    exact: true,
  });
  await expect(screen).toHaveAccessibleDescription("tool_screen_1");
  await expect(browser).toHaveAccessibleDescription("tool_browser_2");
  await selectAlias(page, "GLM-5.3");
  await expect(
    page.getByRole("button", { name: "Attach image for computer" }),
  ).toHaveCount(0);
  await expect(screen).toBeEditable();
  await selectAlias(page, "Kimi K3");
  await screen.fill("Screenshot captured");
  await browser.fill("Page unavailable");
  await page
    .getByRole("checkbox", { name: "Mark browser result as an error" })
    .check();
  await page.getByRole("button", { name: "Attach image for computer" }).click();
  const dialog = page.getByRole("dialog", { name: "Attach image" });
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jzQAAAABJRU5ErkJggg==";
  await dialog.getByLabel("Image file").setInputFiles({
    name: "fixture.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await dialog.getByRole("button", { name: "Attach", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Remove fixture.png" }),
  ).toBeVisible();
  const next = await readFormJSON(page);
  expect(next.messages[1]).toEqual({ role: "assistant", content: clientCalls });
  expect(next.messages[2].role).toBe("user");
  const result = next.messages[2].content;
  expect(result).toEqual([
    {
      type: "tool_result",
      tool_use_id: "tool_screen_1",
      content: "Screenshot captured",
    },
    {
      type: "tool_result",
      tool_use_id: "tool_browser_2",
      is_error: true,
      content: "Page unavailable",
    },
    {
      type: "text",
      text: expect.stringMatching(/tool_screen_1.*fixture\.png/),
    },
    {
      type: "image",
      source: { type: "base64", media_type: "image/png", data: png },
    },
  ]);
  expect(sent).toHaveLength(1);
  await run.click();
  await expect(
    response.getByText("Fixture continuation complete", { exact: true }),
  ).toBeVisible();
  expect(sent[1]).toEqual(next);
});

test("hosted web search and fetch retain their results and signature without manual tool fields", async ({
  page,
}) => {
  const sent = await serveToolReply(page, hostedResults);
  await selectAlias(page, "DeepSeek Flash");
  await disablePlaygroundStreaming(page);
  await addTool(page, "Web search");
  await addTool(page, "Web fetch");
  await page
    .getByRole("textbox", { name: "Prompt", exact: true })
    .fill("Find and read https://example.com.");
  await page.getByRole("button", { name: "Run prompt" }).click();
  const response = page.getByRole("region", { name: "Response" });
  const addToMessages = response.getByRole("button", {
    name: "Add to messages",
  });
  await expect(addToMessages).toBeEnabled();
  for (const name of ["deepseek_web_search", "deepseek_read_url"]) {
    await expect(
      response.getByRole("button", { name: "Server tool use " + name }),
    ).toBeVisible();
    const serverResult = response.getByRole("button", {
      name: "Server tool result " + name,
    });
    await expect(serverResult).toBeVisible();
    if ((await serverResult.getAttribute("aria-expanded")) !== "true")
      await serverResult.click();
    await expect(response.getByLabel("Result for " + name)).toContainText(
      "https://example.com/",
    );
  }
  const rawTab = response.getByText("Raw", { exact: true });
  await rawTab.click();
  const raw = response.getByLabel("Response body");
  expect(JSON.parse(await raw.innerText()).content).toEqual(hostedResults);
  await addToMessages.click();
  await expect(page.locator("[data-tool-result-id]")).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "user message 3", exact: true })
    .fill("Summarize the result.");
  const next = await readFormJSON(page);
  expect(next.messages.slice(1)).toEqual([
    { role: "assistant", content: hostedResults },
    { role: "user", content: "Summarize the result." },
  ]);
  expect(next.tools).toEqual(
    expect.arrayContaining([
      { type: "deepseek_web_search", name: "deepseek_web_search" },
      { type: "deepseek_read_url", name: "deepseek_read_url" },
    ]),
  );
  await page.getByRole("button", { name: "Run prompt" }).click();
  await expect(
    response.getByText("Fixture continuation complete", { exact: true }),
  ).toBeVisible();
  expect(sent).toHaveLength(2);
  expect(sent[1]).toEqual(next);
});
