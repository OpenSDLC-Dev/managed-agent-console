import { expect, test, type Page } from "@playwright/test";

const MOCK = "http://127.0.0.1:18080";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator("form[data-hydrated]").waitFor();
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/agents$/);
}

test.beforeEach(async ({ request }) => {
  await request.post(`${MOCK}/__reset`);
});

test("sessions filter by agent: archived included, options paged beyond 100", async ({
  page,
  request,
}) => {
  // Seed 120 agents so the options list spans two pages (limit 100/page).
  for (let i = 0; i < 120; i++) {
    await request.post(`${MOCK}/v1/agents`, {
      headers: { "x-api-key": "test-key" },
      data: {
        name: `Fleet agent ${String(i).padStart(3, "0")}`,
        model: "claude-sonnet-4-8",
        tools: [],
      },
    });
  }

  await signIn(page);
  // The options query itself must include archived agents.
  const optionsRequest = page.waitForRequest(
    (req) =>
      req.url().includes("/api/platform/v1/agents") &&
      req.url().includes("include_archived=true") &&
      req.url().includes("limit=100"),
  );
  await page.getByRole("link", { name: "Sessions", exact: true }).click();
  await optionsRequest;
  await expect(
    page.getByRole("cell", { name: /Install deps and run tests/ }),
  ).toBeVisible();

  // The archived fixture agent is offered, badged.
  await page.getByRole("combobox", { name: "Agent filter" }).click();
  await expect(
    page.getByRole("option", { name: /Retired agent archived/ }),
  ).toBeVisible();

  // An agent past the first options page is selectable and filters serverside.
  const filtered = page.waitForRequest((req) =>
    req.url().includes("agent_id="),
  );
  await page.getByRole("option", { name: "Fleet agent 119" }).click();
  await filtered;
  await expect(page.getByText("No sessions yet")).toBeVisible();

  // Filtering to a real agent narrows the table to its sessions.
  await page.getByRole("combobox", { name: "Agent filter" }).click();
  await page.getByRole("option", { name: "General task agent" }).click();
  await expect(
    page.getByRole("cell", { name: /Install deps and run tests/ }),
  ).toBeVisible();
  await expect(page.getByText("Survey agent frameworks")).toBeHidden();
});

test("created presets bound sessions and agents lists serverside", async ({
  page,
}) => {
  await signIn(page);

  // Fixture agents were created before today: a 24h bound empties the list.
  const boundedAgents = page.waitForRequest((req) =>
    req.url().includes("created_at%5Bgte%5D="),
  );
  await page.getByRole("combobox", { name: "Created filter" }).click();
  await page.getByRole("option", { name: "Last 24 hours" }).click();
  await boundedAgents;
  await expect(page.getByText("No agents yet")).toBeVisible();
  await page.getByRole("combobox", { name: "Created filter" }).click();
  await page.getByRole("option", { name: "All time" }).click();
  await expect(
    page.getByRole("cell", { name: /Deep researcher/ }),
  ).toBeVisible();

  // Same on sessions.
  await page.getByRole("link", { name: "Sessions", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: /Install deps and run tests/ }),
  ).toBeVisible();
  const boundedSessions = page.waitForRequest(
    (req) =>
      req.url().includes("/api/platform/v1/sessions") &&
      req.url().includes("created_at%5Bgte%5D="),
  );
  await page.getByRole("combobox", { name: "Created filter" }).click();
  await page.getByRole("option", { name: "Last 24 hours" }).click();
  await boundedSessions;
  await expect(page.getByText("No sessions yet")).toBeVisible();
});
