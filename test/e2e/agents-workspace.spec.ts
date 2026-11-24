import { expect, test } from "@playwright/test";
import { signIn } from "./sign-in";
import { grantDashboardModelDiscovery } from "./dashboard-fixture";
import { starters } from "../../src/lib/agent-config/quickstart";

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18080/__reset");
});

test("Agents opens its workspace overview; help, charts, sorting and detail use real routes", async ({
  page,
}) => {
  await signIn(page);
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await nav.locator('[data-nav-group="Agents"]').click();
  await expect(page).toHaveURL(/\/agents\/overview$/);
  const workspace = nav.getByRole("combobox", { name: "Workspace" });
  await workspace.click();
  await expect(page.getByRole("option", { name: "Default" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(workspace).toBeFocused();
  await expect(
    nav.getByRole("link", { name: "Overview", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  const main = page.getByRole("main");
  await expect(main.locator('[data-metric="Sessions"]')).toHaveAttribute(
    "data-value",
    "6",
  );
  await expect(main.locator("[data-change-percent]").first()).toHaveAttribute(
    "data-change-percent",
    "50",
  );
  await expect(main.locator('[data-day="2026-11-29"]')).toHaveAttribute(
    "data-sessions",
    "2",
  );
  await expect(main.locator("[data-median-seconds]").first()).toHaveAttribute(
    "data-median-seconds",
    "12",
  );
  const firstRow = main.locator("tbody tr").first();
  await expect(firstRow.locator("[data-error-rate]")).toHaveAttribute(
    "data-error-rate",
    "25",
  );
  await expect(firstRow.locator("[data-last-active]")).toHaveAttribute(
    "data-last-active",
    "2026-11-30T12:00:00Z",
  );
  const help = main.getByRole("button", {
    name: "About sessions",
    exact: true,
  });
  await help.click();
  await expect(page.getByRole("dialog", { name: "Sessions" })).toContainText(
    "30 days",
  );
  await page.keyboard.press("Escape");
  const daily = main.getByRole("group", { name: /Daily sessions/ });
  await daily.focus();
  await daily.press("ArrowRight");
  await expect(daily.getByRole("status")).toBeVisible();
  await daily.press("Escape");
  const bars = main.getByRole("group", { name: /Median active time/ });
  await bars.focus();
  await bars.press("ArrowDown");
  await expect(bars.getByRole("status")).toBeVisible();
  await main.getByRole("button", { name: "Create", exact: true }).click();
  for (const [name, href] of [
    ["Agent", "/agents/create"],
    ["Session", "/sessions"],
    ["Deployment", "/deployments/new"],
    ["Environment", "/environments/new"],
    ["Memory store", "/memory-stores"],
  ])
    await expect(
      page.getByRole("menuitem", { name, exact: true }),
    ).toHaveAttribute("href", href);
  await page.keyboard.press("Escape");
  const name = main.getByRole("columnheader", { name: "Name" });
  const req = page.waitForRequest((r) =>
    r.url().includes("/agents/overview?sort=name&direction=asc"),
  );
  await name.getByRole("button").click();
  await req;
  await expect(name).toHaveAttribute("aria-sort", "ascending");
  await name.getByRole("button").click();
  await expect(name).toHaveAttribute("aria-sort", "descending");
  const row = main
    .getByRole("region", { name: "Agents activity" })
    .getByRole("link")
    .first();
  const target = await row.getAttribute("href");
  await row.click();
  await expect(page).toHaveURL(new URL(target!, page.url()).href);
  await expect(
    main.getByRole("button", { name: "Observability" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    main.getByRole("link", { name: "View sessions" }),
  ).toHaveAttribute("href", /\/sessions\?agent=agent_/);
});

test("a populated overview sorts every activity measure and Show more opens the directory", async ({
  page,
}) => {
  const report =
    "**/api/console/organizations/default/workspaces/default/agents/overview?*";
  const queries = new Set<string>();
  await page.route(report, async (route) => {
    const params = new URL(route.request().url()).searchParams;
    queries.add(params.get("sort") + ":" + params.get("direction"));
    const response = await route.fetch();
    const data = await response.json();
    const rows = Array.from({ length: 10 }, (_, i) => ({
      ...data.agents[0],
      id: "agent_fixture_" + i,
      name: "Agent " + i,
    }));
    await route.fulfill({ json: { ...data, agents: rows, total: 11 } });
  });
  await signIn(page, "/agents/overview");
  const activity = page.getByRole("region", { name: "Agents activity" });
  await expect(activity).toContainText("10 of 11");
  for (const [label, sort] of [
    ["Error rate", "error_rate"],
    ["Last active", "last_active"],
    ["Sessions", "sessions"],
  ]) {
    const heading = activity.getByRole("columnheader", {
      name: label,
      exact: true,
    });
    for (const direction of ["desc", "asc"]) {
      await heading.getByRole("button").click();
      await expect.poll(() => queries.has(sort + ":" + direction)).toBe(true);
      await expect(heading).toHaveAttribute(
        "aria-sort",
        direction === "desc" ? "descending" : "ascending",
      );
    }
  }
  await activity.getByRole("link", { name: "Show more" }).click();
  await expect(page).toHaveURL(/\/agents$/);
  await expect(
    page.getByRole("link", { name: "Create agent", exact: true }),
  ).toHaveAttribute("href", "/agents/new");
});

test("all twelve starters preview without a write; formats, cancel, blank editor and responsive layout", async ({
  page,
  context,
}) => {
  await grantDashboardModelDiscovery(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:3100",
  });
  await signIn(page, "/agents/create");
  const main = page.getByRole("main");
  let writes = 0;
  const startHistory = await page.evaluate(() => history.length);
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/proxy/v1/agents")) writes++;
  });
  await expect(
    main.getByRole("button", { name: "Create agent", exact: true }),
  ).toBeDisabled();
  for (const s of starters) {
    const card = main.getByRole("button", { name: s.title, exact: true });
    await card.click();
    const preview = page.getByRole("dialog", { name: s.title });
    await expect(preview).toBeVisible();
    await expect(page).toHaveURL(new RegExp("template=" + s.key));
    await expect(preview.locator("pre")).toContainText(s.title);
    if (s.key === "data-analyst") {
      for (const format of ["Python", "TypeScript", "cURL", "YAML"]) {
        await preview.getByRole("button", { name: /Config format:/ }).click();
        await page.getByRole("menuitem", { name: format, exact: true }).click();
        await expect(
          preview.getByRole("button", { name: "Config format: " + format }),
        ).toBeVisible();
      }
      const displayed = await preview.locator("pre").innerText();
      await preview.getByRole("button", { name: "Copy code" }).click();
      await expect
        .poll(() => page.evaluate(() => navigator.clipboard.readText()))
        .toBe(displayed);
    }
    await preview.getByRole("button", { name: "Cancel" }).click();
    await expect(preview).toBeHidden();
    await expect(card).toBeFocused();
  }
  // Dismissing a preview returns to the gallery without accumulating extra Back stops.
  expect(await page.evaluate(() => history.length)).toBe(startHistory + 1);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
    .toBeLessThanOrEqual(390);
  await main.getByRole("link", { name: "start from a blank agent" }).click();
  await expect(page).toHaveURL(/\/agents\/new$/);
  expect(writes).toBe(0);
});

test("description, refinement and editable YAML use a replay; only confirmation creates the agent", async ({
  page,
}) => {
  await grantDashboardModelDiscovery(page);
  let calls = 0,
    writes = 0;
  await page.route(
    "**/api/organizations/default/proxy/v1/messages*",
    async (route) => {
      calls++;
      const body = route.request().postDataJSON();
      expect(body.model).toBe("deepseek-flash");
      await route.fulfill({
        json: {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                name: calls === 1 ? "Ticket triage" : "Ticket brief",
                description: "Summarize a ticket.",
                system: "Summarize supplied tickets.",
              }),
            },
          ],
          usage: { input_tokens: 10, output_tokens: 10 },
        },
      });
    },
  );
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().endsWith("/proxy/v1/agents")) writes++;
  });
  await signIn(page, "/agents/create");
  const main = page.getByRole("main");
  await main
    .getByRole("textbox", { name: "Describe your agent" })
    .fill("Summarize tickets");
  await main.getByRole("button", { name: "Create agent", exact: true }).click();
  const yaml = main.getByRole("textbox", { name: "Agent configuration" });
  await expect(yaml).toHaveValue(/Ticket triage/);
  expect(writes).toBe(0);
  await main.getByRole("button", { name: "Close panel" }).click();
  await main.getByRole("button", { name: "Keep refining" }).click();
  await expect(yaml).toBeVisible();
  await main
    .getByRole("textbox", { name: "Reply" })
    .fill("Call it Ticket brief");
  await main.getByRole("button", { name: "Send message" }).click();
  await expect(yaml).toHaveValue(/Ticket brief/);
  const original = await yaml.inputValue();
  await yaml.fill("[");
  await expect(main.getByRole("alert")).toBeVisible();
  await expect(
    main.getByRole("button", { name: "Create agent", exact: true }),
  ).toBeDisabled();
  await yaml.fill(original);
  await main.getByRole("button", { name: "Templates" }).click();
  await page
    .getByRole("dialog", { name: "Unsaved changes" })
    .getByRole("button", { name: "Stay" })
    .click();
  await main.getByRole("button", { name: "Create agent", exact: true }).click();
  await expect(
    main.getByRole("heading", { name: "Agent created" }),
  ).toBeVisible();
  expect(calls).toBe(2);
  expect(writes).toBe(1);
  await main
    .getByRole("button", { name: "Export as code", exact: true })
    .click();
  await expect(
    main.getByRole("region", { name: "Agent config" }),
  ).toContainText("Ticket brief");
  const link = main.getByRole("link", { name: /Ticket brief/ });
  await link.click();
  await expect(
    main.getByRole("heading", { name: "Ticket brief" }),
  ).toBeVisible();
});

test("a late create response cannot navigate away from a different unsaved agent", async ({
  page,
}) => {
  await grantDashboardModelDiscovery(page);
  await signIn(page, "/agents/create?template=structured-extractor");
  await page.getByRole("button", { name: "Use this template" }).click();
  let release!: () => void;
  const delayed = new Promise<void>((done) => {
    release = done;
  });
  const post = "**/proxy/v1/agents";
  await page.route(post, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    const response = await route.fetch();
    await delayed;
    await route.fulfill({ response });
  });
  const pending = page.waitForRequest(
    (r) => r.method() === "POST" && r.url().endsWith("/proxy/v1/agents"),
  );
  await page
    .getByRole("main")
    .getByRole("button", { name: "Create agent", exact: true })
    .click();
  await pending;
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await nav.getByRole("link", { name: "Agents", exact: true }).click();
  const prompt = page.getByRole("dialog", { name: "Unsaved changes" });
  await prompt.getByRole("button", { name: "Leave" }).click();
  await page.getByRole("link", { name: "Create agent", exact: true }).click();
  await page.getByLabel("Name", { exact: true }).fill("My second draft");
  const finished = page.waitForResponse(
    (r) =>
      r.request().method() === "POST" && r.url().endsWith("/proxy/v1/agents"),
  );
  release();
  await finished;
  await nav.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: "Stay" }).click();
  await expect(page).toHaveURL(/\/agents\/new$/);
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "My second draft",
  );
});

test("a starter can create an agent, configure its environment and start a fixture session", async ({
  page,
}) => {
  await grantDashboardModelDiscovery(page);
  await signIn(page, "/agents/create?template=structured-extractor");
  await page
    .getByRole("dialog", { name: "Structured extractor" })
    .getByRole("button", { name: "Use this template" })
    .click();
  const main = page.getByRole("main");
  await expect(main.getByLabel("Agent configuration")).toHaveValue(
    /deepseek-flash/,
  );
  await main.getByRole("button", { name: "Create agent", exact: true }).click();
  await expect(
    main.getByRole("heading", { name: "Agent created" }),
  ).toBeVisible();
  await main
    .getByLabel("Choose an environment")
    .selectOption({ label: "cloud-limited" });
  await main.getByRole("button", { name: "Continue", exact: true }).click();
  await main.getByRole("link", { name: /Structured extractor/ }).click();
  await expect(page).toHaveURL(/\/agents\/agent_/);
  await page.goBack();
  await expect(main.locator('button[aria-current="step"]')).toContainText(
    "Start session",
  );
  await main
    .getByRole("button", { name: "Start session", exact: true })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Start session" });
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: /Create session|Start session/ })
    .click();
  await expect(
    main.getByRole("link", { name: "Open session" }),
  ).toHaveAttribute("href", /\/sessions\/sesn_/);
  await main.getByRole("link", { name: "Open session" }).click();
  await expect(page).toHaveURL(/\/sessions\/sesn_/);
  await page.goBack();
  await expect(
    main.getByRole("link", { name: "Open session" }),
  ).toHaveAttribute("href", /\/sessions\/sesn_/);
  const deploy = main.getByRole("link", { name: "Create deployment" });
  await expect(deploy).toHaveAttribute(
    "href",
    /agent=agent_mock.*version=1&environment=env_/,
  );
  await deploy.click();
  const agent = page.getByRole("combobox", { name: "Agent", exact: true });
  await expect(agent).toContainText("Structured extractor · v1");
  await agent.click();
  await expect(
    page.getByRole("option", { name: /Structured extractor · v1/ }),
  ).toHaveAttribute("aria-selected", "true");
});

test("an older Platform keeps its directory and Create when the workspace report is absent", async ({
  page,
}) => {
  await page.route("**/workspaces/default/agents/overview?*", (route) =>
    route.fulfill({
      status: 404,
      json: {
        type: "error",
        error: { type: "not_found_error", message: "Not Found" },
      },
    }),
  );
  await signIn(page, "/agents/overview");
  await expect(page).toHaveURL(/\/agents$/);
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(
    nav.getByRole("link", { name: "Overview", exact: true }),
  ).toHaveCount(0);
  await nav.getByRole("link", { name: "Create", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "What do you want to build?" }),
  ).toBeVisible();
});

test("an empty or failed report remains distinct from zero activity", async ({
  page,
}) => {
  const req =
    "**/api/console/organizations/default/workspaces/default/agents/overview?*";
  await page.route(req, (route) =>
    route.fulfill({
      json: {
        summary: {
          sessions: 0,
          agents: 0,
          error_rate: 0,
          session_change: null,
          error_change: null,
        },
        days: [],
        series: [],
        active_time: [],
        agents: [],
        total: 0,
      },
    }),
  );
  await signIn(page, "/agents/overview");
  await expect(
    page.getByText("No agents in this workspace yet."),
  ).toBeVisible();
  await page.unroute(req);
  await page.route(req, (route) =>
    route.fulfill({
      status: 503,
      json: {
        type: "error",
        error: { type: "api_error", message: "Report temporarily unavailable" },
      },
    }),
  );
  await page.reload();
  await expect(page.getByText("Report temporarily unavailable")).toBeVisible();
  await expect(page.getByText("No agents in this workspace yet.")).toHaveCount(
    0,
  );
});
