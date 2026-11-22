import { expect, test, type Page } from "@playwright/test";
import {
  grantDashboardModelDiscovery,
  setDashboardSession,
} from "./dashboard-fixture";
import {
  DIRECT_REQUEST,
  EXPIRED_REQUEST,
  PLAYGROUND_REQUEST,
  messagesLedger,
  serveMessagesLedger,
} from "./messages-fixture";
import { signIn } from "./sign-in";

test.beforeEach(async ({ request }) => {
  expect((await request.post("http://127.0.0.1:18080/__reset")).ok()).toBe(
    true,
  );
});

function logRow(page: Page, id: string) {
  return page.getByRole("row").filter({
    has: page.getByRole("button", { name: "Copy " + id, exact: true }),
  });
}

test("Messages navigation, Overview links and the selected API key", async ({
  page,
}) => {
  await grantDashboardModelDiscovery(page);
  await serveMessagesLedger(page);
  await signIn(page);
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  const group = nav.locator('[data-nav-group="Messages"]');
  await expect(group).toHaveAttribute("href", "/messages");
  await group.click();
  await expect(page).toHaveURL(/\/messages$/);
  await expect(nav.getByRole("link")).toHaveText([
    "Overview",
    "Playground",
    "Logs",
  ]);
  await expect(nav.getByRole("link", { name: "Overview" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const workspace = nav.getByRole("combobox", { name: "Workspace" });
  await expect(workspace.getByText("Default", { exact: true })).toBeVisible();
  const back = await nav
    .getByRole("button", { name: /back to all sections/i })
    .boundingBox();
  const selector = await workspace.boundingBox();
  const [overview, playground] = await nav
    .getByRole("link")
    .evaluateAll((links) =>
      links.map((link) => link.getBoundingClientRect().top),
    );
  expect(selector!.y - back!.y).toBe(40);
  expect(overview - selector!.y).toBe(40);
  expect(playground - overview).toBe(36);
  await workspace.click();
  const options = page.getByRole("listbox").getByRole("option");
  await expect(options).toHaveCount(1);
  await expect(options).toHaveAccessibleName("Default");
  await expect(options).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Escape");
  await expect(workspace).toBeFocused();
  await workspace.click();
  await options.click();
  await expect(workspace).toHaveAttribute("aria-expanded", "false");
  await expect(page).toHaveURL(/\/messages$/);

  const main = page.getByRole("main");
  await expect(
    main.getByRole("heading", { name: "Messages", level: 1 }),
  ).toBeVisible();
  const tokens = main.getByRole("region", { name: "Tokens", exact: true });
  await expect(tokens).toHaveAttribute("data-value", "108");
  await expect(tokens).toHaveAttribute("data-input-tokens", "96");
  await expect(tokens).toHaveAttribute("data-output-tokens", "12");
  await expect(tokens).toHaveAttribute("data-reported", "1");
  await expect(tokens).toHaveAttribute("data-requests", "2");
  const requests = main.getByRole("region", { name: "Requests", exact: true });
  await expect(requests).toHaveAttribute("data-value", "2");
  const cache = main.getByRole("region", { name: "Cache hit rate" });
  await expect(cache).toHaveAttribute("data-value", String(40 / 96));
  const cacheInfo = cache.getByRole("button", {
    name: "More info about Cache hit rate",
    exact: true,
  });
  await cacheInfo.click();
  await expect(cacheInfo).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByText(/Share of reported input tokens.*last 7 days/i),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(cacheInfo).toHaveAttribute("aria-expanded", "false");
  const resources = main.getByRole("region", { name: "Resources" });
  await expect(resources.getByRole("link", { name: /^Files/ })).toHaveAttribute(
    "href",
    "/files",
  );
  await expect(
    resources.getByRole("link", { name: /^Skills/ }),
  ).toHaveAttribute("href", "/skills");
  await expect(
    resources.getByRole("link", { name: /^Rate limits/ }),
  ).toHaveAttribute("href", "/models");
  await main.getByRole("link", { name: "Open usage" }).click();
  await expect(page).toHaveURL(/\/usage$/);
  await page.goBack();
  await main.getByRole("link", { name: "Open caching" }).click();
  await expect(page).toHaveURL(/\/usage\?range=7#input-tokens$/);
  await expect(main.getByRole("combobox", { name: "Period" })).toHaveValue("7");
  await expect(main.locator("#input-tokens")).toBeVisible();
  await page.goBack();
  await main.getByRole("link", { name: "Open logs" }).click();
  await expect(page).toHaveURL(/\/messages\/logs$/);
  await expect(logRow(page, DIRECT_REQUEST)).toBeVisible();
  await page.goBack();

  await main.getByRole("link", { name: "View all keys" }).click();
  await expect(page).toHaveURL(/\/api-keys$/);
  await page.goBack();
  await main.getByRole("link", { name: /ci-deploy/ }).click();
  await expect(page).toHaveURL(/\/api-keys\?key=apikey_ci01$/);
  await expect(page.getByRole("dialog", { name: "ci-deploy" })).toBeVisible();
  await page.goBack();
  await main.getByRole("button", { name: "Create key", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Your own machine" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  await main.getByRole("link", { name: "Open playground" }).click();
  await expect(page).toHaveURL(/\/playground$/);
  await expect(nav.getByRole("link", { name: "Playground" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await nav.getByRole("link", { name: "Logs" }).click();
  await expect(nav.getByRole("link", { name: "Logs" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await nav.getByRole("button", { name: /back to all sections/i }).click();
  await expect(nav.locator('[data-nav-group="Messages"]')).toBeFocused();
});

test("the cache hit rate uses seven days while tokens and requests use 30", async ({
  page,
}) => {
  const rows = messagesLedger();
  const direct = rows.find((row) => row.request_id === DIRECT_REQUEST)!;
  rows.push({
    ...direct,
    id: 6,
    request_id: "req_messages_older_cache",
    created_at: new Date(Date.now() - 29 * 86_400_000).toISOString(),
    input_tokens: 0,
    output_tokens: 0,
    cache_write_tokens: 0,
    cache_read_tokens: 32,
  });
  await serveMessagesLedger(page, rows);
  await signIn(page, "/messages");
  const main = page.getByRole("main");
  await expect(
    main.getByRole("region", { name: "Tokens", exact: true }),
  ).toHaveAttribute("data-value", "140");
  await expect(
    main.getByRole("region", { name: "Requests", exact: true }),
  ).toHaveAttribute("data-value", "3");
  const cache = main.getByRole("region", { name: "Cache hit rate" });
  await expect(cache).toHaveAttribute("data-value", String(40 / 96));
  await expect(cache).toHaveAttribute("data-cache-read-tokens", "40");
});

test("a cold seven-day caching link scrolls to Input tokens when the daily report arrives late", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 320 });
  await signIn(page);
  let delayed = false;
  await page.route(
    (url) => url.pathname === "/admin/v1/usage/daily",
    async (route) => {
      if (new URL(route.request().frame().url()).pathname !== "/usage")
        return route.fallback();
      delayed = true;
      // The anchor is absent when the browser first resolves the hash.
      await new Promise((resolve) => setTimeout(resolve, 650));
      return route.continue();
    },
  );
  await page.goto("/usage?range=7#input-tokens");
  const main = page.getByRole("main");
  await expect(main.getByRole("combobox", { name: "Period" })).toHaveValue("7");
  await expect(main.locator("#input-tokens")).toBeInViewport({ ratio: 0.8 });
  expect(delayed).toBe(true);
});

test("Logs page through mixed traffic, copy IDs, inspect with the keyboard and refresh", async ({
  page,
  context,
}) => {
  const rows = messagesLedger();
  await serveMessagesLedger(page, rows);
  await signIn(page, "/messages/logs");
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: new URL(page.url()).origin,
  });
  const table = page.getByRole("table", { name: "Logs" });
  await expect(table.getByRole("columnheader")).toHaveText([
    "ID",
    "Status",
    "Time",
    "Model",
    "Input tokens",
    "Output tokens",
    "Latency",
    "Service tier",
  ]);
  const direct = logRow(page, DIRECT_REQUEST);
  await expect(direct).toBeVisible();
  await expect(direct).toContainText("OK");
  await expect(direct).toContainText("minimax-m3");
  await expect(direct.getByRole("cell").nth(4)).toHaveText("96");
  await expect(direct.getByRole("cell").nth(5)).toHaveText("12");
  await expect(direct.getByRole("cell").last()).toHaveText("—");
  const failure = logRow(page, PLAYGROUND_REQUEST);
  await expect(failure).toContainText("Error");
  await expect(failure.getByRole("cell").nth(4)).toHaveText("—");
  // The API-key request keeps its client-supplied affinity ID. The first
  // cursor page contains a delegated Agent call, an embedding and Chat Completions.
  await expect(table.getByRole("row")).toHaveCount(3);
  await direct.getByRole("button", { name: "Copy " + DIRECT_REQUEST }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe(DIRECT_REQUEST);
  await expect(page).toHaveURL(/\/messages\/logs$/);

  await direct.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(
    /\/messages\/logs\?request=req_messages_direct$/,
  );
  const details = page.getByRole("dialog", { name: "Request details" });
  const directId = details.getByRole("button", {
    name: "Copy " + DIRECT_REQUEST,
  });
  const playgroundId = details.getByRole("button", {
    name: "Copy " + PLAYGROUND_REQUEST,
  });
  await expect(directId).toBeVisible();
  await expect(
    details.getByRole("region", { name: "Authentication" }),
  ).toContainText("apikey_ci01");
  const latency = details.getByRole("button", { name: "About latency" });
  await latency.click();
  const latencyInfo = details.getByRole("dialog", {
    name: "Latency",
    exact: true,
  });
  await expect(latencyInfo).toContainText("Time to first token");
  await page.keyboard.press("Escape");
  await expect(latencyInfo).toHaveCount(0);
  await expect(directId).toBeVisible();
  await expect(
    details.getByRole("button", { name: "Previous request" }),
  ).toBeDisabled();
  await details.getByRole("button", { name: "Next request" }).click();
  await expect(playgroundId).toBeVisible();
  await expect(
    details.getByRole("region", { name: "Authentication" }),
  ).toContainText("prn_messages_operator");
  await expect(details.getByText("api_error")).toBeVisible();
  await expect(
    details.getByRole("button", { name: "Next request" }),
  ).toBeDisabled();
  await details.getByRole("button", { name: "Previous request" }).click();
  await expect(directId).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(direct).toBeFocused();

  await logRow(page, PLAYGROUND_REQUEST).click();
  await expect(page).toHaveURL(
    /\/messages\/logs\?request=req_messages_playground$/,
  );
  await page.reload();
  await expect(playgroundId).toBeVisible();
  await page
    .getByRole("main")
    .getByRole("heading", { name: "Logs", exact: true })
    .click({ position: { x: 8, y: 8 } });
  await expect(page).toHaveURL(/\/messages\/logs$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText(/As of /)).toBeVisible();

  rows.unshift({
    ...rows.find((row) => row.request_id === DIRECT_REQUEST)!,
    id: 13,
    request_id: "req_messages_new",
    created_at: new Date().toISOString(),
  });
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(logRow(page, "req_messages_new")).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(4);
});

test("Logs preserve the empty state and reject an out-of-window detail bookmark", async ({
  page,
}) => {
  await serveMessagesLedger(
    page,
    messagesLedger().filter(
      (row) => ![DIRECT_REQUEST, PLAYGROUND_REQUEST].includes(row.request_id),
    ),
  );
  await signIn(page, "/messages/logs");
  await expect(page.getByText("No logs in the last 30 days.")).toBeVisible();
  await page.goto("/messages/logs?request=" + EXPIRED_REQUEST);
  await expect(
    page.getByText("Request not found in the last 30 days."),
  ).toBeVisible();
});

test("a failed refresh hides the old log and a later refresh restores it", async ({
  page,
}) => {
  await serveMessagesLedger(page);
  await signIn(page, "/messages/logs");
  await expect(logRow(page, DIRECT_REQUEST)).toBeVisible();
  await page.route(
    "**/admin/v1/usage/requests?*",
    (route) =>
      route.fulfill({
        status: 403,
        json: {
          type: "error",
          error: { type: "permission_error", message: "Log access withdrawn" },
        },
      }),
    { times: 1 },
  );
  const refresh = page.getByRole("button", { name: "Refresh" });
  await refresh.click();
  await expect(page.getByText("Log access withdrawn")).toBeVisible();
  await expect(logRow(page, DIRECT_REQUEST)).toHaveCount(0);
  await expect(page.getByText(/As of /)).toHaveCount(0);
  await refresh.click();
  await expect(logRow(page, DIRECT_REQUEST)).toBeVisible();
  await expect(page.getByText("Log access withdrawn")).toHaveCount(0);
});

test("load older Messages and keep bookmark neighbors when a new request arrives", async ({
  page,
}) => {
  const recent = messagesLedger().find(
    (row) => row.request_id === DIRECT_REQUEST,
  )!;
  const rows = Array.from({ length: 51 }, (_, index) => ({
    ...recent,
    id: 51 - index,
    request_id: "req_page_" + (51 - index),
    created_at: new Date(Date.now() - (index + 1) * 60_000).toISOString(),
  }));
  await serveMessagesLedger(page, rows);
  await signIn(page, "/messages/logs");
  const more = page.getByRole("button", { name: "Load more" });
  await expect(logRow(page, "req_page_2")).toBeVisible();
  await expect(logRow(page, "req_page_1")).toHaveCount(0);
  await more.click();
  await expect(more).toHaveCount(0);
  await logRow(page, "req_page_1").click();
  const selected = page
    .getByRole("dialog", { name: "Request details" })
    .getByRole("button", { name: "Copy req_page_1", exact: true });
  await expect(selected).toBeVisible();
  await page.reload();
  await expect(selected).toBeVisible();
  // A request arrives after the bookmark restores its window. Previous must
  // still move from request 1 to 2 across the boundary of the older page.
  rows.unshift({
    ...recent,
    id: 52,
    request_id: "req_page_52",
    created_at: new Date().toISOString(),
  });
  const detail = page.getByRole("dialog", { name: "Request details" });
  await detail.getByRole("button", { name: "Previous request" }).click();
  await expect(page).toHaveURL(/\/messages\/logs\?request=req_page_2$/);
  await expect(
    detail.getByRole("button", { name: "Copy req_page_2", exact: true }),
  ).toBeVisible();
  await detail.getByRole("button", { name: "Next request" }).click();
  await expect(selected).toBeVisible();
});

test("Messages pages fit phone width and a log can be inspected and closed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await grantDashboardModelDiscovery(page);
  await serveMessagesLedger(page);
  await signIn(page, "/messages");
  const main = page.getByRole("main");
  const fits = () =>
    page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  await expect(main.getByRole("link", { name: /ci-deploy/ })).toBeVisible();
  expect(await fits()).toBe(true);
  await main.getByRole("link", { name: "Open logs" }).click();
  const row = logRow(page, DIRECT_REQUEST);
  await expect(row).toBeVisible();
  expect(await fits()).toBe(true);
  await row.getByText("OK", { exact: true }).click();
  const details = page.getByRole("dialog", { name: "Request details" });
  await expect(
    details.getByRole("button", { name: "Copy " + DIRECT_REQUEST }),
  ).toBeVisible();
  expect(await fits()).toBe(true);
  await details.getByRole("button", { name: "Close details" }).click();
  await expect(details).toHaveCount(0);
  await page.goto("/playground");
  await expect(main.getByLabel("Prompt", { exact: true })).toBeVisible();
  expect(await fits()).toBe(true);
});

test("a Playground-only principal has one Messages destination", async ({
  page,
}) => {
  await signIn(page);
  await expect(
    page.locator('[data-dashboard-metric="tokens"] [data-value]'),
  ).toBeVisible();
  await setDashboardSession(page, { role: "user", playground_access: true });
  const adminReads: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith("/admin/")) adminReads.push(path);
  });
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  for (const bookmark of [
    "/messages",
    "/messages/logs?request=" + DIRECT_REQUEST,
  ]) {
    await page.goto(bookmark);
    await expect(page).toHaveURL(/\/playground$/);
    await expect(nav.getByRole("link")).toHaveText(["Playground"]);
  }
  expect(adminReads).toEqual([]);
});

test("edit, preview, run once and restore the Playground response from History", async ({
  page,
  baseURL,
}) => {
  await grantDashboardModelDiscovery(page);
  await serveMessagesLedger(page);
  const messagePath = "/api/organizations/default/proxy/v1/messages";
  const privateURL = new URL(messagePath + "?beta=true", baseURL).href;
  const inference = (url: URL) =>
    /\/v1\/(?:messages|chat\/completions|responses)$/.test(url.pathname);
  const sends: string[] = [];
  // Replay the same Messages event sequence as test/native/platform.go.
  await page.route(inference, (route) => {
    const request = route.request();
    if (request.method() !== "POST") return route.fallback();
    sends.push(request.url());
    if (request.url() !== privateURL) return route.abort();
    const frame = (type: string, fields: object = {}) =>
      "event: " +
      type +
      "\ndata: " +
      JSON.stringify({ type, ...fields }) +
      "\n\n";
    return route.fulfill({
      contentType: "text/event-stream",
      body: [
        frame("message_start", {
          message: {
            id: "msg_fixture",
            type: "message",
            role: "assistant",
            model: "minimax-m3",
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 3, output_tokens: 0 },
          },
        }),
        frame("content_block_start", {
          index: 0,
          content_block: { type: "text", text: "" },
        }),
        frame("content_block_delta", {
          index: 0,
          delta: { type: "text_delta", text: "Fixture response" },
        }),
        frame("content_block_stop", { index: 0 }),
        frame("message_delta", {
          delta: { stop_reason: "end_turn", stop_sequence: null },
          usage: { output_tokens: 2 },
        }),
        frame("message_stop"),
      ].join(""),
    });
  });
  await signIn(page, "/messages");
  await page.getByRole("link", { name: "Open playground" }).click();
  const main = page.getByRole("main");
  const model = main.getByRole("combobox", { name: "Model", exact: true });
  await model.click();
  await page.getByRole("option", { name: "MiniMax M3" }).click();
  await main.getByRole("button", { name: "Model settings" }).click();
  await page.getByLabel("Max tokens").fill("32");
  await page.keyboard.press("Escape");
  const prompt = main.getByRole("textbox", { name: "Prompt", exact: true });
  await prompt.fill("Hello from Messages");
  await main.getByText("Code", { exact: true }).click();
  const curl = main.getByRole("textbox", { name: "cURL request code" });
  await expect(curl).toHaveValue(/minimax-m3/);
  await expect(curl).toHaveValue(/Hello from Messages/);
  const editedPrompt = "Hello from code";
  await curl.fill(
    (await curl.inputValue()).replace("Hello from Messages", editedPrompt),
  );
  await main.getByLabel("Code language").selectOption("JSON");
  const json = main.getByRole("textbox", { name: "JSON request code" });
  await expect(json).toHaveValue(/Hello from code/);
  const settings = main.getByRole("button", { name: "Code snippet settings" });
  const streaming = page.getByRole("menuitemcheckbox", { name: "Streaming" });
  await settings.click();
  await expect(streaming).toBeChecked();
  await streaming.click();
  await page.keyboard.press("Escape");
  await expect(json).toHaveValue(/"stream": false/);
  await settings.click();
  await expect(streaming).not.toBeChecked();
  await streaming.click();
  await page.keyboard.press("Escape");
  await expect(json).toHaveValue(/"stream": true/);
  const request = JSON.parse(await json.inputValue());
  await json.fill("{");
  await main.getByText("Form", { exact: true }).click();
  await expect(json).toHaveValue("{");
  await expect(json).toHaveAttribute("aria-invalid", "true");
  await expect(main.getByRole("alert")).toBeVisible();
  const run = main.getByRole("button", { name: "Run prompt" });
  await run.click();
  await expect(json).toHaveValue("{");
  await json.fill(JSON.stringify({ ...request, max_tokens: 24 }));
  await main.getByText("Form", { exact: true }).click();
  await expect(prompt).toHaveValue(editedPrompt);
  expect(sends).toEqual([]);

  const pending = page.waitForRequest(
    (request) =>
      request.method() === "POST" && inference(new URL(request.url())),
  );
  await run.click();
  const posted = await pending;
  expect(posted.url()).toBe(privateURL);
  expect(posted.postDataJSON()).toMatchObject({
    model: "minimax-m3",
    max_tokens: 24,
    messages: [{ role: "user", content: editedPrompt }],
    stream: true,
  });
  expect(posted.headers()).toMatchObject({
    "x-csrf-token": expect.stringMatching(/\S/),
    "x-organization-uuid": "default",
    "x-workspace-id": "default",
  });
  expect(posted.headers()).not.toHaveProperty("x-api-key");
  expect(posted.headers()).not.toHaveProperty("authorization");
  await expect(
    main.getByText("Fixture response", { exact: true }),
  ).toBeVisible();
  await main.getByText("Raw", { exact: true }).click();
  await expect(main.getByLabel("Response body")).toContainText(
    '"output_tokens": 2',
  );
  await main.getByText("Rendered", { exact: true }).click();
  await main.getByRole("button", { name: "Add to messages" }).click();
  await expect(
    main.getByRole("textbox", { name: "assistant message 2", exact: true }),
  ).toHaveValue("Fixture response");
  await main.getByRole("button", { name: "New", exact: true }).click();
  await expect(prompt).toBeEmpty();
  await main.getByRole("button", { name: "History" }).click();
  const history = main.getByRole("region", { name: "History" });
  await history.getByRole("button", { name: /Hello from code/ }).click();
  await expect(prompt).toHaveValue(editedPrompt);
  await expect(
    main.getByText("Fixture response", { exact: true }),
  ).toBeVisible();
  expect(sends).toEqual([posted.url()]);
});

async function openNonStreamingPlayground(page: Page, baseURL?: string) {
  await grantDashboardModelDiscovery(page);
  const url = new URL(
    "/api/organizations/default/proxy/v1/messages?beta=true",
    baseURL,
  );
  const calls: unknown[] = [];
  const answer = {
    id: "msg_nonstream_fixture",
    type: "message",
    role: "assistant",
    model: "minimax-m3",
    content: [{ type: "text", text: "Non-streaming reply" }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 4, output_tokens: 3 },
  };
  await page.route(url.href, (route) => {
    calls.push(route.request().postDataJSON());
    return route.fulfill({ json: answer });
  });
  await signIn(page, "/playground");
  return { calls, answer };
}

test("edit the full request in Form, return to the fields and run a JSON response", async ({
  page,
  baseURL,
}) => {
  const { calls, answer } = await openNonStreamingPlayground(page, baseURL);
  const main = page.getByRole("main");
  await expect(
    main.getByRole("combobox", { name: "Model", exact: true }),
  ).toBeEnabled();
  await main.getByRole("button", { name: "More request options" }).click();
  await page.getByRole("menuitem", { name: "Edit full request" }).click();
  await expect(
    main.getByRole("radio", { name: "Form", exact: true }),
  ).toBeChecked();
  await expect(
    main.getByRole("heading", { name: "Headers", exact: true }),
  ).toBeVisible();
  await expect(
    main.getByRole("heading", { name: "Body", exact: true }),
  ).toBeVisible();
  const request = {
    model: "minimax-m3",
    max_tokens: 16,
    messages: [{ role: "user", content: "Run without streaming" }],
    stream: false,
  };
  await main
    .getByRole("textbox", { name: "Request body" })
    .fill(JSON.stringify(request));
  await main.getByRole("button", { name: "Back", exact: true }).click();
  await expect(main.getByRole("textbox", { name: "Prompt" })).toHaveValue(
    "Run without streaming",
  );
  expect(calls).toEqual([]);
  await main.getByRole("button", { name: "Run prompt" }).click();
  await expect(
    main.getByText("Non-streaming reply", { exact: true }),
  ).toBeVisible();
  await main.getByText("Raw", { exact: true }).click();
  const raw = main.getByLabel("Response body");
  await expect(raw).toBeVisible();
  expect(JSON.parse(await raw.innerText())).toEqual(answer);
  expect(calls).toEqual([request]);
});

test("cache-controlled system blocks and nested tool results survive Form, Code and Run", async ({
  page,
  baseURL,
}) => {
  const { calls } = await openNonStreamingPlayground(page, baseURL);
  // The Platform converter fixtures exercise both cached system blocks and
  // tool_result blocks containing an array of text blocks.
  const request = {
    model: "minimax-m3",
    max_tokens: 32,
    stream: false,
    system: [
      {
        type: "text",
        text: "Reply in the same language.\nPreserve all quoted names.",
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [
      {
        name: "get_time",
        description: "Read the fixture clock.",
        input_schema: {
          type: "object",
          properties: { zone: { type: "string" } },
          required: ["zone"],
        },
      },
    ],
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "What time is it in Shanghai?" }],
      },
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "toolu_clock",
            name: "get_time",
            input: { zone: "Asia/Shanghai" },
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "toolu_clock",
            content: [{ type: "text", text: "15:00\n上海时间" }],
          },
          { type: "text", text: "Please include the zone." },
        ],
      },
    ],
  };
  const main = page.getByRole("main");
  await expect(
    main.getByRole("combobox", { name: "Model", exact: true }),
  ).toBeEnabled();
  await main.getByRole("button", { name: "More request options" }).click();
  await page.getByRole("menuitem", { name: "Edit full request" }).click();
  await main
    .getByRole("textbox", { name: "Request body" })
    .fill(JSON.stringify(request));
  await main.getByRole("button", { name: "Back", exact: true }).click();
  await expect(main.getByRole("alert")).toHaveCount(0);
  await main.getByText("Code", { exact: true }).click();
  await main.getByLabel("Code language").selectOption("JSON");
  const json = main.getByRole("textbox", { name: "JSON request code" });
  expect(JSON.parse(await json.inputValue())).toEqual(request);
  await main.getByText("Form", { exact: true }).click();
  await expect(
    main.getByRole("radio", { name: "Form", exact: true }),
  ).toBeChecked();
  const system = main.getByRole("textbox", { name: "System", exact: true });
  await expect(system).toHaveValue(request.system[0].text);
  // Editing the text and restoring it must preserve its array and cache metadata.
  await system.fill("A temporary edit");
  await system.fill(request.system[0].text);
  await expect(
    main.getByRole("textbox", { name: "user message 3" }),
  ).toHaveJSProperty("readOnly", true);
  await main
    .getByRole("button", {
      name: "Edit content blocks for user message 3",
      exact: true,
    })
    .click();
  const fullBody = main.getByRole("textbox", { name: "Request body" });
  expect(JSON.parse(await fullBody.inputValue())).toEqual(request);
  await main.getByRole("button", { name: "Back", exact: true }).click();
  expect(calls).toEqual([]);
  await main.getByRole("button", { name: "Run prompt" }).click();
  await expect(
    main.getByText("Non-streaming reply", { exact: true }),
  ).toBeVisible();
  expect(calls).toEqual([request]);
});
