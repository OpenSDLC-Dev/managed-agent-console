import {
  expect,
  request as pwRequest,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { LIVE_CONSOLE_PASSWORD, resolveLiveEnv } from "./env";

/**
 * Live tier: the console against a REAL platform stack (deploy/compose in
 * the platform repo), spending real model tokens. One worker, file order —
 * later tests reuse resources authored by earlier ones, and everything this
 * suite creates is name-prefixed `live-e2e-` and archived in cleanup.
 *
 * Model turns are the expensive, nondeterministic part; the suite runs
 * exactly one session with two HITL turns (approve, deny) and derives every
 * trace assertion from it.
 */

const { baseUrl, apiKey } = resolveLiveEnv();
const RUN = Date.now().toString(36);

// Resolved once in the first test; module state carries across the file
// (single worker, sequential order).
let api: APIRequestContext;
let modelId: string;
let environmentId: string;
const createdAgentIds: string[] = [];
let runnerAgentId: string;

const AGENT_TOOLSET = "agent_toolset_20260401";

async function platformGet(path: string): Promise<Record<string, unknown>> {
  const res = await api.get(`${baseUrl}/${path}`, {
    headers: { "x-api-key": apiKey },
  });
  expect(res.ok(), `GET ${path} -> ${res.status()}`).toBe(true);
  return (await res.json()) as Record<string, unknown>;
}

async function platformPost(
  path: string,
  data: unknown,
): Promise<Record<string, unknown>> {
  const res = await api.post(`${baseUrl}/${path}`, {
    headers: { "x-api-key": apiKey },
    data,
  });
  expect(res.ok(), `POST ${path} -> ${res.status()}`).toBe(true);
  return (await res.json()) as Record<string, unknown>;
}

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator("form[data-hydrated]").waitFor();
  await page.getByLabel("Password").fill(LIVE_CONSOLE_PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/agents$/);
}

test.beforeAll(async () => {
  api = await pwRequest.newContext();
  // The model id must exist in the deployment's model-providers config.
  // LIVE_MODEL_ID overrides; otherwise reuse whatever an existing agent
  // runs — a stack that passed acceptance always has one.
  modelId = process.env.LIVE_MODEL_ID ?? "";
  if (!modelId) {
    const agents = (await platformGet("v1/agents?limit=1")).data as {
      model: { id: string };
    }[];
    if (agents.length === 0) {
      throw new Error(
        "No LIVE_MODEL_ID set and no existing agents to infer a model from — " +
          "set LIVE_MODEL_ID to a model your platform's model-providers config serves.",
      );
    }
    modelId = agents[0].model.id;
  }
});

test.afterAll(async () => {
  for (const id of createdAgentIds) {
    await api
      .post(`${baseUrl}/v1/agents/${id}/archive`, {
        headers: { "x-api-key": apiKey },
        data: {},
      })
      .catch(() => {});
  }
  await api.dispose();
});

test("the console connects to the real platform and lists real agents", async ({
  page,
}) => {
  await signIn(page);
  await expect(page.getByText("Platform connected")).toBeVisible();
  // The stack has at least one real agent (the model-discovery precondition).
  await expect
    .poll(async () => page.locator("tbody tr").count())
    .toBeGreaterThan(0);
});

test("an externally-authored compact default_config survives a console save", async ({
  page,
}) => {
  const created = await platformPost("v1/agents", {
    name: `live-e2e-roundtrip-${RUN}`,
    model: { id: modelId },
    system: "",
    description: "console live-tier round-trip check",
    tools: [{ type: AGENT_TOOLSET, default_config: { enabled: false } }],
    mcp_servers: [],
    skills: [],
  });
  const id = created.id as string;
  createdAgentIds.push(id);

  await signIn(page);
  await page.goto(`/agents/${id}/edit`);
  // The editor resolves the compact shape: default row unchecked, tools follow.
  await expect(
    page.getByRole("checkbox", { name: "default enabled" }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "bash enabled" }),
  ).not.toBeChecked();

  // Save untouched — before plan 03 slice 4 this exploded the shape into
  // eight per-tool entries. The real platform must get the compact form back.
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(new RegExp(`/agents/${id}$`));

  const after = await platformGet(`v1/agents/${id}`);
  expect(after.version).toBe(2);
  expect(after.tools).toEqual([
    { type: AGENT_TOOLSET, default_config: { enabled: false } },
  ]);
});

test("sessions filter by agent server-side; created presets bound real lists", async ({
  page,
}) => {
  // A reusable environment: the first existing one, else our own.
  const envs = (await platformGet("v1/environments?limit=1")).data as {
    id: string;
  }[];
  environmentId =
    envs[0]?.id ??
    ((
      await platformPost("v1/environments", {
        name: `live-e2e-env-${RUN}`,
        config: {
          type: "cloud",
          networking: { type: "unrestricted" },
          packages: { apt: [], pip: [], npm: [], go: [], gem: [], cargo: [] },
        },
      })
    ).id as string);

  const [agentA, agentB] = await Promise.all(
    ["a", "b"].map((suffix) =>
      platformPost("v1/agents", {
        name: `live-e2e-filter-${suffix}-${RUN}`,
        model: { id: modelId },
        system: "",
        description: "",
        tools: [{ type: AGENT_TOOLSET }],
        mcp_servers: [],
        skills: [],
      }),
    ),
  );
  createdAgentIds.push(agentA.id as string, agentB.id as string);
  for (const [suffix, agent] of [
    ["a", agentA],
    ["b", agentB],
  ] as const) {
    await platformPost("v1/sessions", {
      agent: agent.id as string,
      environment_id: environmentId,
      title: `live-e2e-session-${suffix}-${RUN}`,
    });
  }

  await signIn(page);
  await page.getByRole("link", { name: "Sessions", exact: true }).click();

  // Server-side agent filter: A's session stays, B's goes.
  await page.getByRole("combobox", { name: "Agent filter" }).click();
  await page
    .getByRole("option", { name: new RegExp(`live-e2e-filter-a-${RUN}`) })
    .click();
  await expect(
    page.getByRole("cell", { name: new RegExp(`live-e2e-session-a-${RUN}`) }),
  ).toBeVisible();
  await expect(
    page.getByRole("cell", { name: new RegExp(`live-e2e-session-b-${RUN}`) }),
  ).toBeHidden();

  // Created preset: fresh sessions stay under "Last 24 hours".
  await page.getByRole("combobox", { name: "Created filter" }).click();
  await page.getByRole("option", { name: "Last 24 hours" }).click();
  await expect(
    page.getByRole("cell", { name: new RegExp(`live-e2e-session-a-${RUN}`) }),
  ).toBeVisible();

  // Exclusion needs history we cannot author (the server stamps created_at):
  // if the stack carries an agent older than 24 h, it must vanish under the
  // preset on the agents page.
  const oldAgent = (
    (await platformGet("v1/agents?limit=100")).data as {
      name: string;
      created_at: string;
    }[]
  ).find(
    (agent) =>
      Date.now() - Date.parse(agent.created_at) > 24 * 3600_000 &&
      !agent.name.startsWith("live-e2e-"),
  );
  await page.getByRole("link", { name: "Agents", exact: true }).click();
  await page.getByRole("combobox", { name: "Created filter" }).click();
  await page.getByRole("option", { name: "Last 24 hours" }).click();
  await expect(
    page.getByRole("cell", { name: new RegExp(`live-e2e-filter-a-${RUN}`) }),
  ).toBeVisible();
  if (oldAgent) {
    await expect(
      page.getByRole("cell", { name: oldAgent.name, exact: true }),
    ).toBeHidden();
  } else {
    console.log(
      "live tier: no agent older than 24h on this stack — created-preset exclusion not exercised",
    );
  }
});

test("a starter template creates a real gated agent", async ({ page }) => {
  await signIn(page);
  await page.goto("/agents/new");
  await page.getByRole("button", { name: /Code task runner/ }).click();
  await expect(page.getByLabel("Name")).toHaveValue("Code task runner");

  // The template's model id is a placeholder; the real stack serves modelId.
  await page.getByLabel("Name").fill(`live-e2e-runner-${RUN}`);
  const model = page.getByLabel("Model", { exact: true });
  await model.fill(modelId);

  await page.getByRole("button", { name: "Create agent", exact: true }).click();
  await expect(page).toHaveURL(/\/agents\/agent_/);
  runnerAgentId = page.url().split("/agents/")[1];
  createdAgentIds.push(runnerAgentId);
  await expect(
    page.getByRole("heading", { name: `live-e2e-runner-${RUN}` }),
  ).toBeVisible();
  await expect(page.getByText("always_ask")).toBeVisible();

  // The wire shape is the compact one — bash's ask policy, nothing else.
  const agent = await platformGet(`v1/agents/${runnerAgentId}`);
  expect(agent.tools).toEqual([
    {
      type: AGENT_TOOLSET,
      configs: [{ name: "bash", permission_policy: { type: "always_ask" } }],
    },
  ]);
});

test("HITL against the real model: approve, deny, and the trace reads", async ({
  page,
  context,
}) => {
  // Two real model turns; budget generously.
  test.setTimeout(600_000);
  const turnTimeout = 240_000;
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);

  const session = await platformPost("v1/sessions", {
    agent: runnerAgentId,
    environment_id: environmentId,
    title: `live-e2e-hitl-${RUN}`,
  });

  await signIn(page);
  await page.goto(`/sessions/${session.id as string}`);
  await expect(page.getByTestId("stream-state")).toHaveAttribute(
    "data-state",
    "live",
    { timeout: 30_000 },
  );

  // Turn 1: a bash call the always_ask policy must gate; approve it.
  // No "do nothing else" clauses: a well-behaved model would honor them
  // across turns and refuse turn 2 (observed live — the refusal was real).
  await page
    .getByPlaceholder("Send a message to this session…")
    .fill(
      "Use the bash tool to run exactly this command: echo LIVE_OK. " +
        "Then report its output back to me and stop.",
    );
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page
      .getByTestId("event-row")
      .getByText(/echo LIVE_OK/)
      .first(),
  ).toBeVisible({ timeout: turnTimeout });
  await expect(page.getByTestId("approval-banner")).toBeVisible({
    timeout: turnTimeout,
  });
  await expect(
    page
      .getByTestId("event-row")
      .filter({ hasText: "agent.tool_use" })
      .getByText("needs approval"),
  ).toBeVisible();

  await page.getByRole("button", { name: "Allow" }).click();
  await expect(
    page
      .getByTestId("event-row")
      .filter({ hasText: "agent.tool_result" })
      .filter({ hasText: "LIVE_OK" }),
  ).toBeVisible({ timeout: turnTimeout });
  await expect(page.getByTestId("approval-banner")).toBeHidden({
    timeout: turnTimeout,
  });

  // Trace readability on real events (plan 03 slices 1+3):
  // the span end row carries real token usage and its paired duration…
  const spanEnd = page
    .getByTestId("event-row")
    .filter({ hasText: "span.model_request_end" })
    .first();
  await expect(spanEnd).toBeVisible({ timeout: turnTimeout });
  await expect(spanEnd).toContainText(/\d[\d,]* in · [\d,]+ out/);
  await expect(spanEnd.getByTitle("model request duration")).toBeVisible();
  // …and the paired start folds away.
  await expect(
    page.locator('[data-event-type="span.model_request_start"]'),
  ).toHaveCount(0);

  // The detail panel opens on the real event with its raw wire shape.
  await spanEnd.click();
  const panel = page.getByTestId("event-detail");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText(/\d[\d,]* in · [\d,]+ out/);
  await panel.getByText("Raw event").click();
  await expect(panel).toContainText('"model_request_start_id"');
  await panel.getByRole("button", { name: "Close event details" }).click();

  // Debug shows every event verbatim — the folded span start included.
  await page.getByRole("button", { name: "Debug", exact: true }).click();
  await expect(
    page
      .getByTestId("debug-row")
      .filter({ hasText: "span.model_request_start" })
      .first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Transcript", exact: true }).click();

  // Session chips carry the real usage counters.
  const chips = page.getByTestId("session-chips");
  await expect(chips).toContainText(new RegExp(`live-e2e-runner-${RUN}`));
  await expect(chips).toContainText(/\d[\d,]* in · [\d,]+ out/);

  // Turn 2: deny with a message; the platform lands it as an errored result.
  await page
    .getByPlaceholder("Send a message to this session…")
    .fill(
      "New task: you must use the bash tool to run this command: echo SECOND_TURN",
    );
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByTestId("approval-banner")).toBeVisible({
    timeout: turnTimeout,
  });
  await page.getByRole("button", { name: "Deny…" }).click();
  await page.getByPlaceholder("Reason (optional)").fill("Denied by live e2e");
  await page.getByRole("button", { name: "Deny", exact: true }).click();
  await expect(
    page
      .getByTestId("event-row")
      .filter({ hasText: "agent.tool_result" })
      .filter({ hasText: "Denied by live e2e" }),
  ).toBeVisible({ timeout: turnTimeout });
  await expect(page.getByTestId("approval-banner")).toBeHidden({
    timeout: turnTimeout,
  });
  // The denied turn still settles.
  await expect(
    page
      .getByTestId("event-row")
      .filter({ hasText: "session.status_idle" })
      .last(),
  ).toBeVisible({ timeout: turnTimeout });

  // Copy all serializes the real trace.
  await page.getByRole("button", { name: "Copy all" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  const copied = JSON.parse(
    await page.evaluate(() => navigator.clipboard.readText()),
  ) as { type: string }[];
  expect(copied[0].type).toBe("user.message");
  expect(copied.some((event) => event.type === "agent.tool_use")).toBe(true);
  expect(copied.some((event) => event.type === "span.model_request_end")).toBe(
    true,
  );
});
