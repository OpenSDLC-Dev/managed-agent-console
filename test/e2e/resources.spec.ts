import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ request }) => {
  // Earlier spec files mutate the mock's stores — start from fixtures.
  await request.post("http://127.0.0.1:18080/__reset");
});

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator("form[data-hydrated]").waitFor();
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/agents$/);
}

test("agents list renders fixtures and the archived filter", async ({
  page,
}) => {
  await signIn(page);
  await expect(
    page.getByRole("cell", { name: /Deep researcher/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: /General task agent/ }),
  ).toBeVisible();
  await expect(page.getByText("Retired agent")).toBeHidden();

  await page.getByRole("combobox", { name: "Status filter" }).click();
  await page.getByRole("option", { name: "All" }).click();
  await expect(page.getByText("Retired agent")).toBeVisible();
});

test("agent detail shows overview, system prompt, and versions", async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole("cell", { name: /Deep researcher/ }).click();
  await expect(page).toHaveURL(/\/agents\/agent_researcher00000000001$/);
  await expect(
    page.getByRole("heading", { name: "Deep researcher" }),
  ).toBeVisible();
  await expect(page.getByText("You are a careful researcher.")).toBeVisible();
  // Three version rows: v3, v2, v1.
  await expect(
    page.getByRole("cell", { name: "v3", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "v1", exact: true }),
  ).toBeVisible();
});

test("environments list and detail render the config union", async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole("link", { name: "Environments", exact: true }).click();
  await expect(page.getByRole("cell", { name: "cloud-limited" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Self-hosted" })).toBeVisible();

  await page.getByRole("cell", { name: "cloud-limited" }).click();
  await expect(
    page.getByText("limited — api.github.com, registry.npmjs.org"),
  ).toBeVisible();
  // A cloud environment has no worker to hold a key, so the section is absent
  // rather than empty — the reference makes the same distinction.
  await expect(page.getByTestId("environment-keys")).toHaveCount(0);
});

test("a self-hosted environment lists its keys, live and expired", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/environments/env_byoc0000000000000001");
  await expect(page.getByTestId("environment-keys")).toBeVisible();

  // Expired keys stay listed on purpose (envkeys.go:102-106): the operator
  // whose worker stopped connecting needs to see the credential it fails on.
  const live = page.getByRole("row").filter({ hasText: "prod-runner-01" });
  await expect(live.locator("[data-token-id]")).toHaveAttribute(
    "data-token-id",
    "envkey_prod00000000000001",
  );
  await expect(live.locator("[data-key-state]")).toHaveAttribute(
    "data-key-state",
    "active",
  );

  // The live key's expiry is computed a year out in the fixtures rather than
  // pinned, so this asserts the derivation and not today's date.
  const stale = page.getByRole("row").filter({ hasText: "retired-laptop" });
  await expect(stale.locator("[data-key-state]")).toHaveAttribute(
    "data-key-state",
    "expired",
  );
  await expect(stale.locator("[data-expires-at]")).toHaveAttribute(
    "data-expires-at",
    "2026-01-01T09:00:00Z",
  );
});

test("sessions list filters by status", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Sessions", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "Install deps and run tests" }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "Survey agent frameworks" }),
  ).toBeVisible();
  // Tokens column carries the usage counters as raw integers (CLAUDE.md);
  // the rendered string is asserted once, in session-live.spec.ts. Scoped to
  // its row, not `.first()` — the list sorts newest-first, so position is not
  // identity.
  const tokens = page
    .getByRole("row")
    .filter({ hasText: "Install deps and run tests" })
    .getByTestId("tokens-cell");
  await expect(tokens).toHaveAttribute("data-input-tokens", "5412");
  await expect(tokens).toHaveAttribute("data-output-tokens", "890");

  await page.getByRole("combobox", { name: "Status filter" }).click();
  await page.getByRole("option", { name: "running" }).click();
  await expect(
    page.getByRole("cell", { name: "Install deps and run tests" }),
  ).toBeHidden();
  await expect(
    page.getByRole("cell", { name: "Survey agent frameworks" }),
  ).toBeVisible();
});

test("session detail shows the trace and the pending-approval banner", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/sessions/sesn_gatedbash00000000001");

  await expect(page.getByTestId("approval-banner")).toBeVisible();
  await expect(page.getByText("Waiting on 1 tool approval")).toBeVisible();

  // Full trace: 7 fixture events, minus the span start the transcript hides.
  await expect(page.getByTestId("event-row")).toHaveCount(6);

  // The Tools filter narrows to the single tool_use event.
  await page.getByRole("button", { name: "Tools", exact: true }).click();
  await expect(page.getByTestId("event-row")).toHaveCount(1);
  await expect(page.getByTestId("event-row")).toHaveAttribute(
    "data-event-type",
    "agent.tool_use",
  );

  // Token usage from the model span is summarized on the span row.
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(
    page.getByTestId("event-row").filter({ hasText: "span.model_request_end" }),
  ).toHaveAttribute("data-input-tokens", "5412");
});

test("vaults list and detail render secret-free credentials", async ({
  page,
}) => {
  await signIn(page);
  await page
    .getByRole("link", { name: "Credential vaults", exact: true })
    .click();
  await expect(page.getByRole("cell", { name: /GitHub access/ })).toBeVisible();
  await expect(page.getByText("Old Jira vault")).toBeHidden();

  await page.getByRole("cell", { name: /GitHub access/ }).click();
  await expect(
    page.getByRole("heading", { name: "GitHub access" }),
  ).toBeVisible();
  // Both credentials, typed by their auth union arm.
  await expect(page.getByText("environment_variable")).toBeVisible();
  await expect(page.getByText("mcp_oauth")).toBeVisible();
  await expect(page.getByText("GITHUB_TOKEN")).toBeVisible();
  await expect(
    page.getByText("Secrets are write-only", { exact: false }),
  ).toBeVisible();
});

test("skills list filters by source; detail shows versions", async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole("link", { name: "Skills", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "Excel spreadsheets" }),
  ).toBeVisible();

  await page.getByRole("combobox").click();
  await page.getByRole("option", { name: "custom" }).click();
  await expect(page.getByText("Excel spreadsheets")).toBeHidden();
  await expect(
    page.getByRole("cell", { name: "Weekly report writer" }),
  ).toBeVisible();

  await page.getByRole("cell", { name: "Weekly report writer" }).click();
  await expect(
    page.getByRole("heading", { name: "Weekly report writer" }),
  ).toBeVisible();
  await expect(page.getByText("Initial version.")).toBeVisible();
});

test("files list renders the classic envelope fields", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Files", exact: true }).click();
  await expect(
    page.getByRole("cell", { name: "research-notes.md", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "summary.xlsx", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: "47.1 KB" })).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "session output" }),
  ).toBeVisible();
});
