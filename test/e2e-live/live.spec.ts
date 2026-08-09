import {
  expect,
  request as pwRequest,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import type { z } from "zod";
import {
  AgentSchema,
  EnvironmentSchema,
  SessionEventSchema,
  SessionSchema,
} from "../../src/lib/platform/schemas";
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
let createdEnvironmentId: string | undefined;
const createdAgentIds: string[] = [];
let runnerAgentId: string;

const AGENT_TOOLSET = "agent_toolset_20260401";

// Like any wire-compatible client (principle 3); the platform accepts and
// ignores the beta token today.
const WIRE_HEADERS = {
  "x-api-key": apiKey,
  "anthropic-beta": "managed-agents-2025-11-06",
};

/**
 * Link B of plan 04's two-link verification model: **the wire schemas must
 * match the real platform.**
 *
 * Link A (`src/lib/platform/schemas.test.ts`) proves the mock matches the
 * schemas, and runs in CI. It cannot prove the schemas match the platform —
 * fixtures and transcription can stay mutually consistent while both drift.
 * Only a real response settles that, so the check lives here, where real
 * responses exist. Every call in this file already funnels through the two
 * helpers below, which makes this a parse at two seams rather than a new suite.
 *
 * Coverage is exactly what this suite touches. Routes it never calls are out of
 * link B's reach, and `assertWireShape` says so out loud instead of passing
 * quietly.
 */
function itemSchemaFor(
  path: string,
): { schema: z.ZodType; name: string } | null {
  const route = path.split("?")[0].replace(/\/+$/, "");
  if (/^v1\/agents(\/[^/]+)?$/.test(route))
    return { schema: AgentSchema, name: "Agent" };
  if (/^v1\/environments(\/[^/]+)?$/.test(route))
    return { schema: EnvironmentSchema, name: "Environment" };
  if (/^v1\/sessions\/[^/]+\/events$/.test(route))
    return { schema: SessionEventSchema, name: "SessionEvent" };
  if (/^v1\/sessions(\/[^/]+)?$/.test(route))
    return { schema: SessionSchema, name: "Session" };
  return null;
}

const uncoveredRoutes = new Set<string>();

/** Parses a real platform response, naming the field and the endpoint on a miss. */
function assertWireShape(
  method: string,
  path: string,
  body: Record<string, unknown>,
): void {
  const entry = itemSchemaFor(path);
  if (!entry) {
    const route = path.split("?")[0];
    if (!uncoveredRoutes.has(route)) {
      uncoveredRoutes.add(route);
      console.log(`link B: no schema mapped for ${route} — not shape-checked`);
    }
    return;
  }
  const rows = Array.isArray(body.data) ? body.data : [body];
  rows.forEach((row, index) => {
    const result = entry.schema.safeParse(row);
    if (result.success) return;
    const issues = result.error.issues
      .map(
        (issue) => `  path: ${JSON.stringify(issue.path)} — ${issue.message}`,
      )
      .join("\n");
    throw new Error(
      `${method} ${path} → ${entry.name}[${index}] does not match ` +
        `src/lib/platform/schemas.ts:\n${issues}`,
    );
  });
}

async function platformGet(path: string): Promise<Record<string, unknown>> {
  const res = await api.get(`${baseUrl}/${path}`, { headers: WIRE_HEADERS });
  expect(res.ok(), `GET ${path} -> ${res.status()}`).toBe(true);
  const body = (await res.json()) as Record<string, unknown>;
  assertWireShape("GET", path, body);
  return body;
}

async function platformPost(
  path: string,
  data: unknown,
): Promise<Record<string, unknown>> {
  const res = await api.post(`${baseUrl}/${path}`, {
    headers: WIRE_HEADERS,
    data,
  });
  expect(res.ok(), `POST ${path} -> ${res.status()}`).toBe(true);
  const body = (await res.json()) as Record<string, unknown>;
  assertWireShape("POST", path, body);
  return body;
}

/**
 * A toolset entry, read for the fields a test asserts rather than for the
 * whole rendered object.
 *
 * The distinction matters here specifically. The platform resolves toolsets
 * **at render** (its #343): `configs` and `default_config` come back with
 * every `enabled` and `permission_policy` concrete, while the stored row keeps
 * the client's own bytes. So an authored shape and its echo are not the same
 * document, and a `toEqual` against the echo pins whichever defaults the
 * platform happened to spell out that week — it broke once already, and would
 * break again the next time an implicit default became explicit. Principle 4
 * says the same thing from the other end: the console must not be stricter
 * than the wire.
 */
type ToolsetEntry = {
  type?: string;
  configs?: { name?: string; permission_policy?: { type?: string } }[];
  default_config?: { enabled?: boolean };
};

function toolsetsOf(agent: Record<string, unknown>): ToolsetEntry[] {
  return (agent.tools ?? []) as ToolsetEntry[];
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
  // Archive everything this run created; a cleanup failure is a real
  // failure — silent leftovers accumulate on the shared stack. The suite's
  // sessions stay deliberately: they are the run's durable record, and the
  // platform refuses to hard-delete an environment they still reference —
  // which is why a fallback-created environment is archived, not deleted.
  const failures: string[] = [];
  const archive = async (path: string) => {
    try {
      const res = await api.post(`${baseUrl}/${path}`, {
        headers: WIRE_HEADERS,
        data: {},
      });
      if (!res.ok()) failures.push(`${path}: HTTP ${res.status()}`);
    } catch (error) {
      failures.push(`${path}: ${String(error)}`);
    }
  };
  for (const id of createdAgentIds) {
    await archive(`v1/agents/${id}/archive`);
  }
  if (createdEnvironmentId) {
    await archive(`v1/environments/${createdEnvironmentId}/archive`);
  }
  await api.dispose();
  if (failures.length > 0) {
    throw new Error(`live cleanup failed: ${failures.join("; ")}`);
  }
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
  // The invariant, not the render. The platform resolves toolsets on the way
  // out (its #343) — `configs` and `default_config` come back with every
  // `enabled` and `permission_policy` spelled out, while the stored row keeps
  // the client's own bytes. Asserting the whole object with `toEqual` pinned
  // that render and broke the next time an implicit default became explicit;
  // it would break again, and the console must not be stricter than the wire.
  //
  // What this test is actually about: the compact shape survived a console
  // save. One entry rather than the eight per-tool ones this regressed into
  // before plan 03 slice 4, and the authored `enabled: false` still authored.
  const tools = toolsetsOf(after);
  expect(tools).toHaveLength(1);
  expect(tools[0].type).toBe(AGENT_TOOLSET);
  expect(tools[0].default_config?.enabled).toBe(false);
  // Empty because nothing named a tool — a populated `configs` here is the
  // explosion itself, so this stays asserted rather than relaxed away.
  expect(tools[0].configs ?? []).toHaveLength(0);
});

test("sessions filter by agent server-side; created presets bound real lists", async ({
  page,
}) => {
  // A reusable CLOUD environment — the compose stack's executor runs cloud
  // sessions; a self_hosted one would park the HITL bash turn forever
  // (review finding, PR #30). Reuse the first cloud env, else create one.
  const envs = (await platformGet("v1/environments?limit=100")).data as {
    id: string;
    config: { type: string };
  }[];
  const cloudEnv = envs.find((env) => env.config.type === "cloud");
  if (cloudEnv) {
    environmentId = cloudEnv.id;
  } else {
    environmentId = (
      await platformPost("v1/environments", {
        name: `live-e2e-env-${RUN}`,
        config: {
          type: "cloud",
          networking: { type: "unrestricted" },
          packages: { apt: [], pip: [], npm: [], go: [], gem: [], cargo: [] },
        },
      })
    ).id as string;
    createdEnvironmentId = environmentId;
  }

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

  // What the template promises on the wire: bash is gated. The rest of the
  // rendered object is the platform's business — it resolves toolsets on the
  // way out, so `enabled` and a `default_config` arrive filled in whether or
  // not the template asked for them (see the round-trip test above).
  const agent = await platformGet(`v1/agents/${runnerAgentId}`);
  const tools = toolsetsOf(agent);
  expect(tools).toHaveLength(1);
  expect(tools[0].type).toBe(AGENT_TOOLSET);
  const bash = (tools[0].configs ?? []).find((entry) => entry.name === "bash");
  expect(bash?.permission_policy?.type).toBe("always_ask");
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
  // The park-for-approval stop already emitted an idle event — remember how
  // many exist so the settle assertion waits for a NEW one, not a stale one
  // (review finding, PR #30: without this the test can go green while the
  // paid post-denial turn is still running).
  const idleRows = page
    .getByTestId("event-row")
    .filter({ hasText: "session.status_idle" });
  const idleCountAtDeny = await idleRows.count();

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
  // The denied turn settles with a fresh idle event.
  await expect
    .poll(() => idleRows.count(), { timeout: turnTimeout })
    .toBeGreaterThan(idleCountAtDeny);

  // Copy all serializes the real trace.
  await page.getByRole("button", { name: "Copy all" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  const copied = JSON.parse(
    await page.evaluate(() => navigator.clipboard.readText()),
  ) as { type: string }[];
  // Link B for events: "Copy all" serializes the raw wire events the console
  // holds, so this is the real platform's event stream — the one shape the two
  // helpers above never see, since the trace arrives over SSE.
  copied.forEach((event, index) => {
    const result = SessionEventSchema.safeParse(event);
    if (result.success) return;
    throw new Error(
      `live trace event[${index}] (${event.type}) does not match ` +
        `src/lib/platform/schemas.ts:\n` +
        result.error.issues
          .map((i) => `  path: ${JSON.stringify(i.path)} — ${i.message}`)
          .join("\n"),
    );
  });
  expect(copied[0].type).toBe("user.message");
  expect(copied.some((event) => event.type === "agent.tool_use")).toBe(true);
  expect(copied.some((event) => event.type === "span.model_request_end")).toBe(
    true,
  );
});
