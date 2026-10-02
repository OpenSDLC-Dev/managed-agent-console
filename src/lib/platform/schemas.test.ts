// @vitest-environment node
/**
 * Link A of plan 04's two-link verification model: **everything the mock
 * platform serves must match the wire schemas.**
 *
 * Two halves, because the mock produces shapes two ways:
 *  1. the static collections in `fixtures.mjs`, which the read paths serve; and
 *  2. the responses `server.mjs` *constructs* on the write paths — `createAgent`
 *     assembles an agent field by field, and sessions, events, environments,
 *     vaults, credentials, skills, and files do the same. Validating only (1)
 *     would let a malformed generated shape keep this suite green while the
 *     whole e2e suite ran against the wrong wire (review finding, PR #32).
 *
 * What this canNOT catch is the schemas themselves drifting from the real
 * platform — fixtures and transcription can stay mutually consistent while both
 * are wrong. That is link B's job, and it runs in the live tier
 * (`test/e2e-live/live.spec.ts`), where real responses exist.
 */
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { z } from "zod";
import * as fixtures from "../../../test/mock-platform/fixtures.mjs";
import {
  API_KEY,
  resetStore,
  server,
} from "../../../test/mock-platform/server.mjs";
import {
  AgentSchema,
  ApiKeyIssuedSchema,
  ApiKeyListSchema,
  ApiKeySchema,
  DeploymentRunSchema,
  DeploymentSchema,
  DreamSchema,
  EnvironmentKeyIssuedSchema,
  EnvironmentKeyPageSchema,
  EnvironmentKeySchema,
  EnvironmentSchema,
  MemorySchema,
  MemoryStoreSchema,
  MemoryVersionSchema,
  PlatformFileSchema,
  SessionResourceSchema,
  SessionEventSchema,
  SessionSchema,
  SessionThreadSchema,
  SkillSchema,
  SkillVersionSchema,
  VaultCredentialSchema,
  VaultSchema,
} from "./schemas";

/**
 * Asserts a value conforms, reporting the zod issue *path* so a mismatch names
 * the field rather than dumping the object.
 */
function expectConforms(
  schema: z.ZodType,
  value: unknown,
  label: string,
): void {
  const result = schema.safeParse(value);
  if (result.success) return;
  const issues = result.error.issues
    .map((issue) => `  path: ${JSON.stringify(issue.path)} — ${issue.message}`)
    .join("\n");
  throw new Error(`${label} does not match the platform wire:\n${issues}`);
}

const each = (schema: z.ZodType, rows: unknown[], label: string) => {
  rows.forEach((row, index) =>
    expectConforms(schema, row, `${label}[${index}]`),
  );
};

const eachIn = (
  schema: z.ZodType,
  map: Record<string, unknown[]>,
  label: string,
) => {
  for (const [key, rows] of Object.entries(map)) {
    each(schema, rows, `${label}.${key}`);
  }
};

describe("mock fixtures conform to the platform wire", () => {
  it("agents, and every agent-version row", () => {
    each(AgentSchema, fixtures.agents, "agents");
    eachIn(AgentSchema, fixtures.agentVersions, "agentVersions");
  });

  it("environments", () => {
    each(EnvironmentSchema, fixtures.environments, "environments");
  });

  it("sessions, and every session's event log", () => {
    each(SessionSchema, fixtures.sessions, "sessions");
    eachIn(SessionEventSchema, fixtures.sessionEvents, "sessionEvents");
    eachIn(SessionThreadSchema, fixtures.sessionThreads, "sessionThreads");
    expectConforms(
      SessionThreadSchema,
      fixtures.neverRunThread,
      "neverRunThread",
    );
    for (const [sessionId, threads] of Object.entries(
      fixtures.sessionThreadEvents,
    )) {
      eachIn(SessionEventSchema, threads, `sessionThreadEvents.${sessionId}`);
    }
  });

  it("deployments and deployment runs", () => {
    each(DeploymentSchema, fixtures.deployments, "deployments");
    each(DeploymentRunSchema, fixtures.deploymentRuns, "deploymentRuns");
  });

  it("dreams", () => {
    each(DreamSchema, fixtures.dreams, "dreams");
  });

  it("memory stores, memories and memory versions", () => {
    each(MemoryStoreSchema, fixtures.memoryStores, "memoryStores");
    each(MemorySchema, fixtures.memories, "memories");
    each(MemoryVersionSchema, fixtures.memoryVersions, "memoryVersions");
  });

  it("a memory store carries archived_at only once archived", () => {
    // The recorded shape (platform#817): an unarchived store has no key at all.
    const [live, archived] = fixtures.memoryStores;
    expect(live).not.toHaveProperty("archived_at");
    expect(MemoryStoreSchema.parse(live).archived_at).toBeUndefined();
    expect(archived.archived_at).toEqual(expect.any(String));
    // A platform release before #817 renders the key as null.
    expectConforms(
      MemoryStoreSchema,
      { ...live, archived_at: null },
      "a store with a null archived_at",
    );
  });

  it("vaults and their credentials", () => {
    each(VaultSchema, fixtures.vaults, "vaults");
    eachIn(
      VaultCredentialSchema,
      fixtures.vaultCredentials,
      "vaultCredentials",
    );
  });

  it("skills and their versions", () => {
    each(SkillSchema, fixtures.skills, "skills");
    eachIn(SkillVersionSchema, fixtures.skillVersions, "skillVersions");
  });

  it("files", () => {
    each(PlatformFileSchema, fixtures.files, "files");
    expect(PlatformFileSchema.parse(fixtures.files[0])).toMatchObject({
      expires_at: null,
    });
    expect(fixtures.files[0]).not.toHaveProperty("scope");
    const missingExpiry = Object.fromEntries(
      Object.entries(fixtures.files[0]).filter(([key]) => key !== "expires_at"),
    );
    expect(PlatformFileSchema.safeParse(missingExpiry).success).toBe(false);
  });

  it("memory-store resource snapshots", () => {
    each(SessionResourceSchema, fixtures.memoryResources, "memoryResources");
  });

  it("environment keys (the console API)", () => {
    eachIn(EnvironmentKeySchema, fixtures.environmentKeys, "environmentKeys");
  });

  it.each([false, true])(
    "multiagent follow-up scenario conforms (running=%s)",
    (running) => {
      const scenario = fixtures.multiagentScenario(running);
      expectConforms(SessionSchema, scenario.session, "multiagent.session");
      each(SessionThreadSchema, scenario.threads, "multiagent.threads");
      each(SessionEventSchema, scenario.events, "multiagent.events");
      eachIn(
        SessionEventSchema,
        scenario.threadEvents,
        "multiagent.threadEvents",
      );
    },
  );

  it("covers every collection the mock exports", () => {
    // A new fixture collection must be validated here, not silently skipped.
    expect(Object.keys(fixtures).sort()).toEqual([
      "agentVersions",
      "agents",
      "deploymentRuns",
      "deployments",
      "dreams",
      "environmentKeys",
      "environments",
      "files",
      "memories",
      "memoryResources",
      "memoryStores",
      "memoryVersions",
      "multiagentScenario",
      "neverRunThread",
      "sessionEvents",
      "sessionThreadEvents",
      "sessionThreads",
      "sessions",
      "skillVersions",
      "skills",
      "vaultCredentials",
      "vaults",
    ]);
  });
});

/**
 * The canary (plan 04 slice 2). Everything above asserts shapes *pass*; a suite
 * built only from passing assertions cannot tell "the schemas match" from "the
 * check silently stopped running". These fixtures are deliberately wrong and
 * asserted to **fail**, so deleting or neutering the gate turns this file red
 * instead of green.
 *
 * They stay inline rather than in `fixtures.mjs`, which the mock server loads
 * and which must remain valid.
 */
describe("probe: the conformance gate catches lies, not only truths", () => {
  const violations: { label: string; schema: z.ZodType; value: unknown }[] = [
    {
      label: "a token counter serialized as a string",
      schema: SessionSchema,
      value: {
        ...fixtures.sessions[0],
        usage: { ...fixtures.sessions[0].usage, input_tokens: "5412" },
      },
    },
    {
      label: "a required field dropped entirely",
      schema: AgentSchema,
      value: Object.fromEntries(
        Object.entries(fixtures.agents[0]).filter(([k]) => k !== "multiagent"),
      ),
    },
    {
      // The spec marks both keys required and nullable: null is "not yet",
      // a missing key is a broken wire.
      label: "a thread's null usage omitted instead of rendered",
      schema: SessionThreadSchema,
      value: Object.fromEntries(
        Object.entries(fixtures.neverRunThread).filter(([k]) => k !== "usage"),
      ),
    },
    {
      label: "an enum value the platform's validation rejects",
      schema: SessionSchema,
      value: { ...fixtures.sessions[0], status: "paused" },
    },
    {
      label: "a reserved seam carrying a value instead of null",
      schema: AgentSchema,
      value: { ...fixtures.agents[0], multiagent: { mode: "swarm" } },
    },
    {
      label: "a discriminated union arm missing its required member",
      schema: EnvironmentSchema,
      value: {
        ...fixtures.environments[0],
        config: { type: "cloud", networking: { type: "unrestricted" } }, // no packages
      },
    },
  ];

  for (const { label, schema, value } of violations) {
    it(`rejects ${label}`, () => {
      const result = schema.safeParse(value);
      expect(
        result.success,
        `${label} passed validation — the conformance gate is not doing anything`,
      ).toBe(false);
    });
  }

  it("the canaries are wrong only in the way intended", () => {
    // Each violation is a one-field mutation of a fixture that DOES conform, so
    // a red canary means the gate broke — not that the fixture rotted.
    expectConforms(SessionSchema, fixtures.sessions[0], "canary base session");
    expectConforms(AgentSchema, fixtures.agents[0], "canary base agent");
    expectConforms(
      SessionThreadSchema,
      fixtures.neverRunThread,
      "canary base thread",
    );
    expectConforms(
      EnvironmentSchema,
      fixtures.environments[0],
      "canary base environment",
    );
  });
});

describe("the mock's constructed write-path responses conform too", () => {
  let base: string;

  const call = async (
    path: string,
    init: RequestInit & { body?: BodyInit },
  ): Promise<unknown> => {
    const res = await fetch(`${base}${path}`, {
      ...init,
      headers: { "x-api-key": API_KEY, ...(init.headers ?? {}) },
    });
    expect(res.ok, `${init.method} ${path} -> ${res.status}`).toBe(true);
    return res.json();
  };

  const postJSON = (path: string, body: unknown) =>
    call(path, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    });

  // The mock parses multipart with regexes rather than a real parser, so a
  // hand-rolled body is enough — and is what the console's proxy sends.
  const postMultipart = (path: string, body: string) =>
    call(path, {
      method: "POST",
      body,
      headers: { "content-type": "multipart/form-data; boundary=--x" },
    });

  beforeAll(async () => {
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    resetStore(); // clears the streamed-reply timers this suite starts
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });

  it("environment keys: list, issue, then the refreshed list", async () => {
    const envId = "env_byoc0000000000000001";
    const path = `/api/oauth/organizations/default/environments/${envId}/tokens`;

    const before = await call(path, { method: "GET" });
    expectConforms(EnvironmentKeyPageSchema, before, `GET ${path}`);

    const issued = await postJSON(path, { name: "conformance-runner" });
    expectConforms(EnvironmentKeyIssuedSchema, issued, `POST ${path}`);
    // The issuance response identifies no row — that is why the console has to
    // re-read the list rather than render from it (consoleapi.go:74-79).
    expect(Object.keys(issued as object).sort()).toEqual([
      "access_token",
      "expires_in",
    ]);

    const after = await call(path, { method: "GET" });
    expectConforms(EnvironmentKeyPageSchema, after, `GET ${path} (after)`);
    const rows = (after as { data: unknown[] }).data;
    expect(rows.length).toBe((before as { data: unknown[] }).data.length + 1);
    each(EnvironmentKeySchema, rows, "issued listing");

    // Revoke answers a bodiless 204, which `call` cannot parse — assert it
    // directly, because this is the shape consolePostNoContent exists for.
    const newest = rows[0] as { id: string };
    const revoking = (id: string) =>
      fetch(`${base}${path}/${id}/revoke`, {
        method: "POST",
        headers: { "x-api-key": API_KEY },
      });

    const revoke = await revoking(newest.id);
    expect(revoke.status).toBe(204);
    expect(await revoke.text()).toBe("");

    // The three revoke outcomes, all confirmed against a live platform on
    // 2026-08-14. Revocation is idempotent because the UPDATE matches on id +
    // environment and coalesces the timestamp (envkeys.go:161-168); the row
    // leaves the listing because the SELECTs filter `revoked_at IS NULL`
    // (envkeys.go:121,133). Only 404 distinguishes "never issued here".
    const afterRevoke = await call(path, { method: "GET" });
    const remaining = (afterRevoke as { data: { id: string }[] }).data;
    expect(remaining.map((k) => k.id)).not.toContain(newest.id);
    expect(
      (afterRevoke as { pagination: { total: number } }).pagination.total,
    ).toBe(rows.length - 1);

    const again = await revoking(newest.id);
    expect(again.status).toBe(204);
    expect(await again.text()).toBe("");

    const unknown = await revoking("envkey_0000000000000000000000000");
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toMatchObject({
      type: "error",
      error: { type: "not_found_error" },
    });
  });

  // The other console dialect (plan 07 slice 4). It is asserted beside the
  // environment-key one on purpose: the two surfaces answer issuance with
  // *different* shapes, and a test that only ever saw one of them would let the
  // console quietly grow a single "console key" abstraction over both.
  it("management keys: list, issue, then disable and archive", async () => {
    const path =
      "/api/console/organizations/default/workspaces/default/api_keys";

    const before = await call(path, { method: "GET" });
    expectConforms(ApiKeyListSchema, before, `GET ${path}`);
    // A bare array — neither the wire's keyset envelope nor files' classic one.
    expect(Array.isArray(before)).toBe(true);

    // `noStore(...)` wraps this route and only this one: it is the single
    // response in the console that carries a plaintext credential, and the
    // proxy's response-header allowlist exists to carry that directive through.
    const issuing = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "x-api-key": API_KEY, "content-type": "application/json" },
      body: JSON.stringify({ name: "no-store-check" }),
    });
    expect(issuing.headers.get("cache-control")).toBe("no-store");
    await issuing.json();

    const issued = await postJSON(path, { name: "conformance-key" });
    expectConforms(ApiKeyIssuedSchema, issued, `POST ${path}`);
    // The whole resource plus the plaintext, unlike the environment-key
    // surface's `{access_token, expires_in}`.
    expect(issued).toMatchObject({ type: "api_key", status: "active" });
    const id = (issued as { id: string }).id;
    // "Never" is the absence of the field, and the response says so.
    expect((issued as { expires_at: string | null }).expires_at).toBe(null);

    const after = await call(path, { method: "GET" });
    each(ApiKeySchema, after as unknown[], "issued listing");
    expect((after as { id: string }[]).map((k) => k.id)).toContain(id);

    const disabled = await postJSON(`${path}/${id}`, { status: "inactive" });
    expectConforms(ApiKeySchema, disabled, `POST ${path}/${id}`);
    expect((disabled as { status: string }).status).toBe("inactive");

    const archived = await postJSON(`${path}/${id}`, { status: "archived" });
    expect((archived as { status: string }).status).toBe("archived");

    // Archived is terminal: nothing may be patched onto it, the repeated
    // archive included.
    const again = await fetch(`${base}${path}/${id}`, {
      method: "POST",
      headers: { "x-api-key": API_KEY, "content-type": "application/json" },
      body: JSON.stringify({ status: "archived" }),
    });
    expect(again.status).toBe(400);

    // A key nobody issued belongs to the control plane's own environment
    // variable, and this surface does not get to touch it — but it is still
    // listed, because hiding it would be the worse lie.
    const bootstrap = (after as { id: string; created_by: unknown }[]).find(
      (k) => k.created_by === null,
    );
    expect(bootstrap).toBeDefined();
    const refused = await fetch(`${base}${path}/${bootstrap!.id}`, {
      method: "POST",
      headers: { "x-api-key": API_KEY, "content-type": "application/json" },
      body: JSON.stringify({ status: "inactive" }),
    });
    expect(refused.status).toBe(400);
    expect(await refused.json()).toMatchObject({
      error: { message: expect.stringContaining("CONTROLPLANE_API_KEY") },
    });
  });

  it("agents: create, update, archive", async () => {
    const created = await postJSON("/v1/agents", {
      name: "conformance",
      model: { id: "claude-opus-5", speed: "fast" },
      system: "be brief",
      skills: [{ type: "custom", skill_id: "skill_x", version: "latest" }],
    });
    expectConforms(AgentSchema, created, "POST /v1/agents");
    const id = (created as { id: string }).id;

    const updated = await postJSON(`/v1/agents/${id}`, {
      description: "updated",
      version: 1,
    });
    expectConforms(AgentSchema, updated, `POST /v1/agents/${id}`);

    // Archive renders the stored agent, archived_at now a timestamp.
    const archived = await postJSON(`/v1/agents/${id}/archive`, {});
    expectConforms(AgentSchema, archived, `POST /v1/agents/${id}/archive`);
    expect((archived as { archived_at: string | null }).archived_at).not.toBe(
      null,
    );
  });

  it("environments: create (cloud and self_hosted), update, archive", async () => {
    const cloud = await postJSON("/v1/environments", {
      name: "conformance-cloud",
      config: {
        type: "cloud",
        networking: {
          type: "limited",
          allowed_hosts: ["example.com"],
          allow_mcp_servers: true,
          allow_package_managers: false,
        },
        packages: { npm: ["typescript"] },
      },
    });
    expectConforms(EnvironmentSchema, cloud, "POST /v1/environments (cloud)");

    const selfHosted = await postJSON("/v1/environments", {
      name: "conformance-self-hosted",
      config: { type: "self_hosted" },
    });
    expectConforms(
      EnvironmentSchema,
      selfHosted,
      "POST /v1/environments (self_hosted)",
    );

    const id = (cloud as { id: string }).id;
    const updated = await postJSON(`/v1/environments/${id}`, {
      description: "updated",
    });
    expectConforms(EnvironmentSchema, updated, `POST /v1/environments/${id}`);

    const archived = await postJSON(`/v1/environments/${id}/archive`, {});
    expectConforms(
      EnvironmentSchema,
      archived,
      `POST /v1/environments/${id}/archive`,
    );
  });

  it("deployments: create, update, pause, run, resume, archive", async () => {
    const created = await postJSON("/v1/deployments", {
      name: "conformance deployment",
      agent: {
        type: "agent",
        id: fixtures.agents[0].id,
        version: fixtures.agents[0].version,
      },
      environment_id: fixtures.environments[0].id,
      initial_events: [{ type: "user.message", content: "Run it." }],
      resources: [
        {
          type: "github_repository",
          url: "https://github.com/example/project",
          authorization_token: "write-only-test-token",
        },
      ],
      schedule: { type: "cron", expression: "0 9 * * 1", timezone: "UTC" },
    });
    expectConforms(DeploymentSchema, created, "POST /v1/deployments");
    expect(JSON.stringify(created)).not.toContain("write-only-test-token");
    const id = (created as { id: string }).id;

    const updated = await postJSON(`/v1/deployments/${id}`, {
      description: "updated",
      metadata: { owner: "console" },
    });
    expectConforms(DeploymentSchema, updated, `POST /v1/deployments/${id}`);

    const paused = await postJSON(`/v1/deployments/${id}/pause`, {});
    expectConforms(
      DeploymentSchema,
      paused,
      `POST /v1/deployments/${id}/pause`,
    );
    expect(paused).toMatchObject({
      status: "paused",
      paused_reason: { type: "manual" },
    });

    const run = await postJSON(`/v1/deployments/${id}/run`, {});
    expectConforms(DeploymentRunSchema, run, `POST /v1/deployments/${id}/run`);
    const session = await call(
      `/v1/sessions/${(run as { session_id: string }).session_id}`,
      { method: "GET" },
    );
    expectConforms(SessionSchema, session, "deployment-created session");
    expect(session).toMatchObject({ deployment_id: id });
    const persisted = (await call(
      `/v1/sessions/${(run as { session_id: string }).session_id}/events`,
      { method: "GET" },
    )) as { data: unknown[] };
    each(SessionEventSchema, persisted.data, "deployment initial events");
    expect(persisted.data).toContainEqual(
      expect.objectContaining({ type: "user.message", content: "Run it." }),
    );

    const resumed = await postJSON(`/v1/deployments/${id}/unpause`, {});
    expect(resumed).toMatchObject({ status: "active", paused_reason: null });
    const archived = await postJSON(`/v1/deployments/${id}/archive`, {});
    expectConforms(
      DeploymentSchema,
      archived,
      `POST /v1/deployments/${id}/archive`,
    );
  });

  it("memory stores: create, patch, write, delete, redact and archive", async () => {
    const store = await postJSON("/v1/memory_stores", {
      name: "Conformance memory",
      description: "Durable context",
      metadata: { owner: "console", remove: "me" },
    });
    expectConforms(MemoryStoreSchema, store, "POST /v1/memory_stores");
    expect(store).not.toHaveProperty("archived_at");
    const storeId = (store as { id: string }).id;

    const patched = await postJSON(`/v1/memory_stores/${storeId}`, {
      metadata: { owner: "platform", remove: null },
    });
    expectConforms(MemoryStoreSchema, patched, "PATCH-like store update");
    expect(patched).not.toHaveProperty("archived_at");
    expect((patched as { metadata: object }).metadata).toEqual({
      owner: "platform",
    });

    const created = await postJSON(
      `/v1/memory_stores/${storeId}/memories?view=full`,
      { path: "/brief.md", content: "First" },
    );
    expectConforms(MemorySchema, created, "POST memory view=full");
    expect((created as { content: string | null }).content).toBe("First");
    const memoryId = (created as { id: string }).id;
    const firstVersionId = (created as { memory_version_id: string })
      .memory_version_id;

    const updated = await postJSON(
      `/v1/memory_stores/${storeId}/memories/${memoryId}?view=full`,
      {
        content: "Second",
        precondition: {
          type: "content_sha256",
          content_sha256: (created as { content_sha256: string })
            .content_sha256,
        },
      },
    );
    expectConforms(MemorySchema, updated, "POST memory update");
    expect((updated as { content: string | null }).content).toBe("Second");

    const redacted = await postJSON(
      `/v1/memory_stores/${storeId}/memory_versions/${firstVersionId}/redact`,
      {},
    );
    expectConforms(MemoryVersionSchema, redacted, "POST version redact");
    expect(redacted).toMatchObject({
      path: null,
      content: null,
      content_sha256: null,
    });

    const removeMemory = await fetch(
      `${base}/v1/memory_stores/${storeId}/memories/${memoryId}?expected_content_sha256=${(updated as { content_sha256: string }).content_sha256}`,
      { method: "DELETE", headers: { "x-api-key": API_KEY } },
    );
    expect(removeMemory.status).toBe(200);
    const versions = (await call(
      `/v1/memory_stores/${storeId}/memory_versions?view=full`,
      { method: "GET" },
    )) as { data: unknown[] };
    each(MemoryVersionSchema, versions.data, "retained memory versions");
    expect(versions.data).toHaveLength(3);

    const archived = await postJSON(`/v1/memory_stores/${storeId}/archive`, {});
    expectConforms(MemoryStoreSchema, archived, "POST store archive");
    expect(archived).toHaveProperty("archived_at", expect.any(String));
  });

  it("files: upload", async () => {
    const uploaded = await postMultipart(
      "/v1/files",
      '----x\r\nContent-Disposition: form-data; name="file"; filename="notes.md"\r\n' +
        "Content-Type: text/markdown\r\n\r\n# notes\r\n----x--\r\n",
    );
    expectConforms(PlatformFileSchema, uploaded, "POST /v1/files");
    expect(uploaded).toHaveProperty("expires_at", null);
    expect(uploaded).not.toHaveProperty("scope");
  });

  it("files: a page cursor survives deletion of its boundary file", async () => {
    const first = (await call("/v1/files?limit=1", { method: "GET" })) as {
      data: { id: string }[];
      next_page: string;
    };
    expect(first.next_page).toEqual(expect.any(String));
    const path = `/v1/files?limit=1&page=${encodeURIComponent(first.next_page)}`;
    const before = await call(path, { method: "GET" });
    await call(`/v1/files/${first.data[0].id}`, { method: "DELETE" });
    expect(await call(path, { method: "GET" })).toEqual(before);
  });

  it("sessions: create, with a mounted file resource", async () => {
    const agent = (await postJSON("/v1/agents", {
      name: "conformance-session-agent",
      model: "claude-opus-5",
    })) as { id: string };
    const environment = (await postJSON("/v1/environments", {
      name: "conformance-session-env",
      config: { type: "self_hosted" },
    })) as { id: string };
    const file = (await postMultipart(
      "/v1/files",
      '----x\r\nContent-Disposition: form-data; name="file"; filename="in.txt"\r\n' +
        "Content-Type: text/plain\r\n\r\nhi\r\n----x--\r\n",
    )) as { id: string };

    const session = await postJSON("/v1/sessions", {
      agent: agent.id,
      environment_id: environment.id,
      title: "conformance",
      resources: [{ type: "file", file_id: file.id }],
    });
    expectConforms(SessionSchema, session, "POST /v1/sessions");
    // The constructed resource entry is the shape that would otherwise go
    // unvalidated — no fixture session mounts one on the create path.
    expect((session as { resources: unknown[] }).resources).toHaveLength(1);
    const sessionId = (session as { id: string }).id;
    const threads = (await call(`/v1/sessions/${sessionId}/threads`, {
      method: "GET",
    })) as { data: unknown[] };
    each(SessionThreadSchema, threads.data, "created session's threads");
    // Never run, so the spec's null arm (fixtures.mjs:neverRunThread).
    expect(threads.data).toEqual([
      expect.objectContaining({ usage: null, stats: null }),
    ]);
    const rejected = await fetch(`${base}/v1/sessions/${sessionId}/archive`, {
      method: "DELETE",
      headers: { "x-api-key": API_KEY },
    });
    expect(rejected.ok).toBe(false);
    const retained = await call(`/v1/sessions/${sessionId}`, { method: "GET" });
    expectConforms(
      SessionSchema,
      retained,
      "session retained after invalid archive DELETE",
    );
  });

  // One request's status, refusal and retry header, for the refusals asserted
  // whole below.
  const answer = async (method: string, path: string, body?: unknown) => {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { "content-type": "application/json", "x-api-key": API_KEY },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const { error } = (await response.json()) as {
      error: { type: string; message: string };
    };
    return {
      status: response.status,
      retry: response.headers.get("x-should-retry"),
      error,
    };
  };
  const invalid = (message: string) => ({
    status: 400,
    retry: null,
    error: { type: "invalid_request_error", message },
  });
  const notFound = (message: string) => ({
    status: 404,
    retry: null,
    error: { type: "not_found_error", message },
  });

  // sessionresources.go parseSessionResourceInputs: every element's shape in
  // session create's words, before anything is looked up (#540).
  const repo = {
    type: "github_repository",
    url: "https://github.com/example/project",
    authorization_token: "test-only-token",
  };
  const store = "memstore_projectnotes000001";
  const createSessionWith = (resources: unknown) =>
    answer("POST", "/v1/sessions", {
      agent: fixtures.agents[0].id,
      environment_id: fixtures.environments[0].id,
      resources,
    });
  it.each([
    [{}, "type is required"],
    [{ type: "volume" }, 'resource type "volume" is not supported'],
    [{ ...repo, url: undefined }, "url is required"],
    [
      { ...repo, url: "https://github.com/example/project/tree/main" },
      "Invalid `github_repository` resource: invalid github_repository url: must be https://github.com/{owner}/{repo} with no .git suffix",
    ],
    [
      { ...repo, url: "https://github.com/example/.git" },
      "Invalid `github_repository` resource: invalid github_repository url: must be https://github.com/{owner}/{repo} with no .git suffix",
    ],
    [
      { ...repo, authorization_token: undefined },
      "resources.0.github_repository.authorization_token: value is required",
    ],
    [
      { ...repo, authorization_token: "" },
      "resources.0.github_repository.authorization_token: value is required",
    ],
    [{ ...repo, authorization_token: null }, "authorization_token is required"],
    [
      { ...repo, authorization_token: 7 },
      "authorization_token must be a string",
    ],
    [{ ...repo, checkout: "main" }, "checkout must be an object"],
    [{ ...repo, checkout: {} }, "checkout.type is required"],
    [
      { ...repo, checkout: { type: "tag", name: "v1" } },
      'checkout.type must be "branch" or "commit"',
    ],
    [
      { ...repo, checkout: { type: "branch", name: "main", sha: "x" } },
      'Failed to parse request body: unknown field "sha"',
    ],
    [
      { ...repo, checkout: { type: "branch" } },
      "checkout.name is required for a branch checkout",
    ],
    [
      { ...repo, checkout: { type: "commit", sha: "short" } },
      "checkout.sha must be a full 40-character commit SHA",
    ],
    [
      { ...repo, branch: "main" },
      'Failed to parse request body: unknown field "branch"',
    ],
    [{ type: "memory_store" }, "memory_store_id is required"],
    [
      { type: "memory_store", memory_store_id: "mem_x" },
      "memory_store_id must be a valid memory store id",
    ],
    [
      { type: "memory_store", memory_store_id: store, mount_path: "/x" },
      'Failed to parse request body: unknown field "mount_path"',
    ],
    [
      { type: "memory_store", memory_store_id: store, access: "admin" },
      'Failed to parse request: resources[0].access: "admin" is not a valid value; expected one of read_only, read_write',
    ],
    [
      { type: "memory_store", memory_store_id: store, instructions: 42 },
      "instructions must be a string",
    ],
    [
      {
        type: "memory_store",
        memory_store_id: store,
        instructions: "x".repeat(4097),
      },
      "resources.0.memory_store.instructions: must be at most 4096 characters",
    ],
  ])(
    "sessions: a resource %j is refused in the platform's words",
    async (resource, message) => {
      expect(await createSessionWith([resource])).toEqual(invalid(message));
    },
  );

  // sessions.go createSession: environment_id and agent present, then every
  // resource's shape, all before a lookup; inside the create, the
  // environment, then the agent, then the stores and files.
  it("sessions: the body is judged before the environment, the environment before the agent", async () => {
    const create = (body: Record<string, unknown>) =>
      answer("POST", "/v1/sessions", body);
    const env = fixtures.environments[0].id;
    expect(
      await create({ agent: "agent_absent", resources: [{ type: "volume" }] }),
    ).toEqual(invalid("environment_id is required"));
    expect(await create({ environment_id: env })).toEqual(
      invalid("agent: value is required"),
    );
    expect(
      await create({
        agent: "agent_absent",
        environment_id: "env_absent",
        resources: [{ type: "volume" }],
      }),
    ).toEqual(invalid('resource type "volume" is not supported'));
    expect(
      await create({ agent: "agent_absent", environment_id: "env_absent" }),
    ).toEqual(notFound("Environment env_absent not found."));
    expect(
      await create({
        agent: "agent_absent",
        environment_id: env,
        resources: [
          { type: "memory_store", memory_store_id: "memstore_absent" },
        ],
      }),
    ).toEqual(notFound("agent agent_absent not found"));
    expect(
      await create({ agent: fixtures.agents[2].id, environment_id: env }),
    ).toEqual(
      invalid(
        `agent ${fixtures.agents[2].id} is archived and cannot be used to create a session`,
      ),
    );
    expect(
      await create({
        agent: { id: fixtures.agents[0].id },
        environment_id: env,
      }),
    ).toEqual(
      invalid("Failed to parse request: agent.selector.type: Field required"),
    );
    resetStore();
    await call(`/v1/environments/${env}/archive`, { method: "POST" });
    expect(
      await create({ agent: "agent_absent", environment_id: env }),
    ).toEqual(invalid(`environment ${env} is archived`));
    resetStore();
  });

  it("sessions: the memory stores' own rules, then the lookups", async () => {
    resetStore();
    const element = (id: string) => ({
      type: "memory_store",
      memory_store_id: id,
    });
    expect(await createSessionWith([element(store), element(store)])).toEqual(
      invalid(`resources contains duplicate memory_store_id: ${store}`),
    );
    // A shape refusal at any index outranks a lookup at an earlier one.
    expect(
      await createSessionWith([
        element("memstore_absent"),
        { ...element(store), access: "write_only" },
      ]),
    ).toEqual(
      invalid(
        'Failed to parse request: resources[1].access: "write_only" is not a valid value; expected one of read_only, read_write',
      ),
    );
    // sessions.go requestWording: the reference's 404 and 400 (#540, #841).
    expect(await createSessionWith([element("memstore_absent")])).toEqual(
      notFound("Memory store `memstore_absent` not found."),
    );
    expect(
      await createSessionWith([element("memstore_archivednotes0001")]),
    ).toEqual(invalid("Memory store memstore_archivednotes0001 is archived."));
    // Any live store attaches, snapshotted from its row and mounted at the
    // slug of its name (memsync.Slug).
    const session = (await postJSON("/v1/sessions", {
      agent: fixtures.agents[0].id,
      environment_id: fixtures.environments[0].id,
      resources: [element("memstore_dreamoutput000001")],
    })) as { resources: unknown[] };
    expect(session.resources).toEqual([
      expect.objectContaining({
        memory_store_id: "memstore_dreamoutput000001",
        name: "Consolidated research",
        mount_path: "/mnt/memory/consolidated-research",
      }),
    ]);
    resetStore();
  });

  // The resource's own 404 for a GET of an id the mock does not hold, in the
  // platform's words for that route (#540).
  it.each([
    ["/v1/environments/env_absent", "Environment env_absent not found."],
    ["/v1/sessions/sesn_absent", "Session not found: sesn_absent"],
    // sessions.go normalizeSessionID, before the lookup and the message.
    ["/v1/sessions/session_absent", "Session not found: sesn_absent"],
    [
      "/v1/memory_stores/memstore_absent",
      "memory store not found: memstore_absent",
    ],
    ["/v1/files/file_absent", "File `file_absent` not found."],
    ["/v1/skills/skill_absent", "Skill not found: skill_absent"],
    ["/v1/skills/skill_absent/versions", "Skill not found: skill_absent"],
    ["/v1/agents/agent_absent", "agent agent_absent not found"],
    [
      "/v1/agents/agent_absent?version=2",
      "agent agent_absent version 2 not found",
    ],
    [
      `/v1/agents/${fixtures.agents[1].id}?version=9`,
      `agent ${fixtures.agents[1].id} version 9 not found`,
    ],
    ["/v1/agents/agent_absent/versions", "agent agent_absent not found"],
    ["/v1/deployments/depl_absent", "deployment depl_absent not found"],
    ["/v1/deployment_runs/drun_absent", "deployment run drun_absent not found"],
    ["/v1/dreams/drm_absent", "dream drm_absent not found"],
    ["/v1/vaults/vlt_absent", "vault vlt_absent not found"],
    ["/v1/vaults/vlt_absent/credentials", "vault vlt_absent not found"],
    [
      "/v1/vaults/vlt_github00000000000001/credentials/vcrd_absent",
      "Credential not found.",
    ],
    // A credential under another vault is the same 404 (#540).
    [
      "/v1/vaults/vlt_pastsafe000000000001/credentials/vcred_ghtoken000000000001",
      "Credential not found.",
    ],
    [
      "/v1/memory_stores/memstore_absent/memories",
      "memory store memstore_absent not found",
    ],
    [
      `/v1/memory_stores/${store}/memories/mem_absent`,
      "memory `mem_absent` not found",
    ],
    [
      "/v1/memory_stores/memstore_absent/memories/mem_absent",
      "memory store memstore_absent not found",
    ],
    [
      "/v1/memory_stores/memstore_absent/memory_versions",
      "memory store memstore_absent not found",
    ],
    [
      "/v1/memory_stores/memstore_absent/memory_versions/memver_absent",
      "memory version memver_absent not found",
    ],
    ["/v1/sessions/sesn_absent/events", "session sesn_absent not found"],
    ["/v1/sessions/sesn_absent/threads", "session sesn_absent not found"],
    [
      "/v1/sessions/sesn_absent/threads/sthr_absent",
      "session sesn_absent not found",
    ],
    [
      "/v1/sessions/sesn_research0000000000001/threads/sthr_absent",
      "thread sthr_absent not found",
    ],
    [
      "/v1/sessions/sesn_research0000000000001/threads/sthr_absent/events",
      "thread sthr_absent not found",
    ],
    [
      "/v1/sessions/sesn_research0000000000001/threads/sthr_absent/stream",
      "thread sthr_absent not found",
    ],
    ["/v1/sessions/sesn_absent/events/stream", "session sesn_absent not found"],
    // server.go errUnknownPath: a path no route matches (#540).
    ["/v1/unknown", "Not found"],
  ])("GET %s answers the resource's own 404", async (path, message) => {
    expect(await answer("GET", path)).toEqual(notFound(message));
  });

  it("a cursor the list did not mint is page.go's 400", async () => {
    expect(await answer("GET", "/v1/agents?page=bogus")).toEqual(
      invalid("invalid page cursor"),
    );
  });

  // wire.go checkAgentPathID and threads.go threadIDs: a path id that is no
  // id of the resource (domain.WellFormedID) is the reference's 400, before
  // anything is looked up (#841).
  const research = "sesn_research0000000000001";
  it.each([
    ["GET", "/v1/agents/undefined"],
    ["GET", "/v1/agents/agent_01UnknownAgentIdXXXXXXXX?version=x"],
    ["GET", "/v1/agents/agent_cloud/versions"],
    ["POST", "/v1/agents/agent_01UnknownAgentIdXXXXXXXX"],
    ["POST", "/v1/agents/undefined/archive"],
  ])("%s %s refuses a malformed agent id", async (method, path) => {
    expect(
      await answer(method, path, method === "POST" ? {} : undefined),
    ).toEqual(invalid("Invalid agent ID."));
  });
  it.each([
    ["GET", `/v1/sessions/${research}/threads/sth_01HbamSkv49mRn4JHt9ryS6T`],
    [
      "GET",
      `/v1/sessions/${research}/threads/sthr_01UnknownThreadIdXXXXXXXXX/events`,
    ],
    ["GET", `/v1/sessions/${research}/threads/sthr_bad_id/stream`],
    ["POST", `/v1/sessions/${research}/threads/sthr_lost/archive`],
    ["GET", "/v1/sessions/sesn_absent/threads/sthr_lost"],
  ])("%s %s refuses a malformed thread id", async (method, path) => {
    const thread = path.split("/threads/")[1].split("/")[0];
    expect(
      await answer(method, path, method === "POST" ? {} : undefined),
    ).toEqual(invalid(`Invalid thread ID: ${thread}`));
  });
  it("a well-formed agent id the mock does not hold is the agent's 404, and an update reads its body's keys first", async () => {
    expect(
      await answer("GET", "/v1/agents/agent_0000000000000000000000000"),
    ).toEqual(notFound("agent agent_0000000000000000000000000 not found"));
    expect(
      await answer("POST", "/v1/agents/undefined", { z: 1, a: 2 }),
    ).toEqual(invalid('Failed to parse request body: unknown field "a"'));
  });

  // roster.go resolveRoster: the roster's shape and each entry's, all of them
  // before any member is looked up (#540).
  const member = fixtures.agents[1].id;
  const roster = (agents: unknown) => ({ type: "coordinator", agents });
  it.each([
    [[member], "multiagent must be an object"],
    [
      { type: "advisor", agents: [member] },
      'multiagent.type must be "coordinator"',
    ],
    [
      { type: "coordinator", agents: [member], max: 3 },
      'Failed to parse request body: unknown field "max"',
    ],
    [{ type: "coordinator" }, "multiagent.agents must be an array"],
    [roster("x"), "multiagent.agents must be an array"],
    [roster([]), "multiagent.coordinator.agents: must contain at least 1 item"],
    [roster(null), "multiagent.agents must have between 1 and 20 entries"],
    [
      roster(Array.from({ length: 21 }, () => member)),
      "multiagent.agents must have between 1 and 20 entries",
    ],
    [
      roster([null]),
      "Failed to parse request: multiagent.agents[0]: must be a string or an object (got null)",
    ],
    [
      roster([7]),
      'multiagent.agents[0]: entry must be an agent id string, {"type":"agent","id",…} or {"type":"self"}',
    ],
    [roster([""]), "multiagent.agents[0]: agent id must not be empty"],
    [
      roster(["agent_01UnknownAgentIdXXXXXXXX"]),
      "Agent has invalid configuration: subagent agent_01UnknownAgentIdXXXXXXXX is not a valid agent ID",
    ],
    [
      roster([{ type: "agent", id: "bogus" }]),
      "Agent has invalid configuration: subagent bogus is not a valid agent ID",
    ],
    [
      roster([{ type: "advisor" }]),
      'multiagent.agents[0]: entry type must be "agent" or "self"',
    ],
    [roster([{ type: "agent" }]), "multiagent.agents[0]: id is required"],
    [
      roster([{ type: "agent", id: 7 }]),
      "multiagent.agents[0]: id must be a string",
    ],
    [
      roster([{ type: "agent", id: member, version: 0 }]),
      "multiagent.agents[0]: version must be a positive integer",
    ],
    [
      roster([member, { type: "self" }, { type: "self" }]),
      'multiagent.agents.2: at most one {"type":"self"} entry is allowed',
    ],
    [
      roster([member, member]),
      `Agent has invalid configuration: subagent ${member} referenced multiple times`,
    ],
    [
      roster(["agent_0000000000000000000000000"]),
      "multiagent.agents[0]: agent agent_0000000000000000000000000 not found",
    ],
    // An entry refused on shape outranks a member no row holds.
    [
      roster(["agent_0000000000000000000000000", member, member]),
      `Agent has invalid configuration: subagent ${member} referenced multiple times`,
    ],
  ])(
    "agents: a roster %j is refused in the platform's words",
    async (multiagent, message) => {
      expect(
        await answer("POST", "/v1/agents", {
          name: "coordinator",
          model: "claude-sonnet-4-8",
          multiagent,
        }),
      ).toEqual(invalid(message));
    },
  );
  // agents.go agentUpdatePath: the same refusals on update open their path
  // with "agent.".
  it.each([
    [
      roster([]),
      "agent.multiagent.coordinator.agents: must contain at least 1 item",
    ],
    [
      roster([null]),
      "Failed to parse request: agent.multiagent.agents[0]: must be a string or an object (got null)",
    ],
    [
      roster([{ type: "self" }, { type: "self" }]),
      'agent.multiagent.agents.1: at most one {"type":"self"} entry is allowed',
    ],
    [
      roster([{ type: "self" }, member]),
      "multiagent.agents[1]: at most one self entry",
    ],
  ])(
    "agents: an update's roster %j is refused in the platform's words",
    async (multiagent, message) => {
      expect(
        await answer("POST", `/v1/agents/${member}`, { multiagent }),
      ).toEqual(invalid(message));
    },
  );

  // deployments.go createDeployment and deploymentparse.go
  // parseDeploymentSchedule: each field and schedule refusal on its own.
  const deployment = {
    name: "conformance",
    agent: fixtures.agents[0].id,
    environment_id: fixtures.environments[0].id,
    initial_events: [{ type: "user.message", content: "Go." }],
  };
  const schedule = { type: "cron", expression: "0 9 * * 1", timezone: "UTC" };
  it.each([
    [{ ...deployment, name: undefined }, "name is required"],
    [{ ...deployment, name: 7 }, "name must be a string"],
    [
      { ...deployment, environment_id: undefined },
      "environment_id is required",
    ],
    [{ ...deployment, agent: null }, "agent is required"],
    [
      { ...deployment, initial_events: undefined },
      "initial_events: Field required",
    ],
    [
      { ...deployment, initial_events: {} },
      "initial_events must be an array of events",
    ],
    [
      { ...deployment, initial_events: [] },
      "initial_events must contain at least 1 event",
    ],
    [
      { ...deployment, initial_events: null },
      "initial_events must contain at least 1 event",
    ],
    [{ ...deployment, schedule: "daily" }, "schedule must be an object"],
    [
      { ...deployment, schedule: { ...schedule, expression: 5 } },
      "schedule must be an object",
    ],
    [
      { ...deployment, schedule: { ...schedule, timezome: "UTC" } },
      'Failed to parse request body: unknown field "timezome"',
    ],
    [
      { ...deployment, schedule: { ...schedule, type: undefined } },
      "schedule.type is required",
    ],
    [
      { ...deployment, schedule: { ...schedule, type: "interval" } },
      'schedule.type "interval" is not supported; the only schedule type is "cron"',
    ],
    [
      { ...deployment, schedule: { ...schedule, expression: "" } },
      "schedule.expression is required",
    ],
    [
      { ...deployment, schedule: { ...schedule, timezone: undefined } },
      "schedule.timezone: Field required",
    ],
    [
      { ...deployment, schedule: { ...schedule, timezone: null } },
      "schedule.timezone is required",
    ],
    [
      { ...deployment, schedule: { ...schedule, expression: "0".repeat(257) } },
      "schedule.expression cannot exceed 256 characters",
    ],
  ])(
    "deployments: a create %# is refused in the platform's words",
    async (body, message) => {
      expect(await answer("POST", "/v1/deployments", body)).toEqual(
        invalid(message),
      );
    },
  );
  it.each([
    [{ initial_events: null }, "initial_events cannot be cleared"],
    [{ initial_events: [] }, "initial_events must contain at least 1 event"],
    [
      { schedule: { ...schedule, type: "interval" } },
      'schedule.type "interval" is not supported; the only schedule type is "cron"',
    ],
  ])(
    "deployments: an update %j is refused in the platform's words",
    async (body, message) => {
      expect(
        await answer("POST", "/v1/deployments/depl_weekresearch00000001", body),
      ).toEqual(invalid(message));
    },
  );

  // deployments.go: everything the body says is judged before the
  // transaction; then an update's row, then the environment, the vaults and
  // the agent, in that order.
  it("deployments: the body is judged before any lookup, the environment first among them", async () => {
    const absent = {
      ...deployment,
      agent: "agent_absent",
      environment_id: "env_absent",
      vault_ids: ["vlt_absent"],
    };
    expect(
      await answer("POST", "/v1/deployments", {
        ...absent,
        schedule: { ...schedule, type: "interval" },
      }),
    ).toEqual(
      invalid(
        'schedule.type "interval" is not supported; the only schedule type is "cron"',
      ),
    );
    expect(
      await answer("POST", "/v1/deployments", { ...absent, vault_ids: ["x"] }),
    ).toEqual(invalid('vault_ids entry "x" is not a vault id'));
    expect(await answer("POST", "/v1/deployments", absent)).toEqual(
      notFound("Environment env_absent not found."),
    );
    expect(
      await answer("POST", "/v1/deployments", {
        ...absent,
        environment_id: fixtures.environments[0].id,
      }),
    ).toEqual(invalid("vault vlt_absent not found"));
    expect(
      await answer("POST", "/v1/deployments", {
        ...absent,
        environment_id: fixtures.environments[0].id,
        vault_ids: [],
      }),
    ).toEqual(notFound("agent agent_absent not found"));
    expect(
      await answer("POST", "/v1/deployments", {
        ...deployment,
        agent: { type: "agent", id: fixtures.agents[0].id, version: 99 },
      }),
    ).toEqual(notFound(`agent ${fixtures.agents[0].id} version 99 not found`));
    // An update: its body before its row, the row before what it sets.
    expect(
      await answer("POST", "/v1/deployments/depl_absent", {
        schedule: { ...schedule, type: "interval" },
      }),
    ).toEqual(
      invalid(
        'schedule.type "interval" is not supported; the only schedule type is "cron"',
      ),
    );
    expect(
      await answer("POST", "/v1/deployments/depl_absent", {
        environment_id: "env_absent",
      }),
    ).toEqual(notFound("deployment depl_absent not found"));
    expect(
      await answer("POST", "/v1/deployments/depl_weekresearch00000001", {
        agent: "agent_absent",
        initial_events: null,
      }),
    ).toEqual(notFound("agent agent_absent not found"));
    expect(
      await answer("POST", "/v1/deployments/depl_weekresearch00000001", {
        environment_id: null,
      }),
    ).toEqual(invalid("environment_id cannot be cleared"));
    resetStore();
    await call("/v1/deployments/depl_weekresearch00000001/archive", {
      method: "POST",
    });
    expect(
      await answer("POST", "/v1/deployments/depl_weekresearch00000001", {
        initial_events: {},
      }),
    ).toEqual(invalid("initial_events must be an array of events"));
    expect(
      await answer("POST", "/v1/deployments/depl_weekresearch00000001", {
        name: "renamed",
      }),
    ).toEqual(invalid("Cannot modify archived deployment"));
    resetStore();
  });

  it.each(["null", "[]"])(
    "sessions: reject non-object resource mutation body %s",
    async (body) => {
      const response = await fetch(
        `${base}/v1/sessions/${fixtures.sessions[0].id}/resources`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": API_KEY,
          },
          body,
        },
      );
      expect(response.status).toBe(400);
    },
  );

  // The platform's #540 wording (managed-agent-platform c1347766). Each
  // refusal is asserted whole, so a drift in either the sentence or the key
  // it names reddens here rather than in an e2e that reads it off the page.
  const refusal = async (path: string, body: unknown) => {
    const response = await fetch(`${base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify(body),
    });
    expect(response.status, `POST ${path}`).toBe(400);
    const { error } = (await response.json()) as {
      error: { type: string; message: string };
    };
    expect(error.type).toBe("invalid_request_error");
    return error.message;
  };

  // internal/unknownkey.Least: the key named is the least in byte order, not
  // the first the body lists — so the body lists the greater one first.
  it.each([
    ["/v1/agents", 'Failed to parse request body: unknown field "a"'],
    ["/v1/deployments", 'Failed to parse request body: unknown field "a"'],
    ["/v1/dreams", 'Failed to parse request body: unknown field "a"'],
    ["/v1/sessions", 'Failed to parse request body: unknown field "a"'],
    [
      `/v1/sessions/${fixtures.sessions[0].id}`,
      'Failed to parse request body: unknown field "a"',
    ],
    ["/v1/environments", "a: Extra inputs are not permitted"],
  ])("%s names the least unknown key", async (path, message) => {
    expect(await refusal(path, { z: 1, a: 2 })).toBe(message);
  });

  it("a roster self entry names the least unknown key too", async () => {
    expect(
      await refusal("/v1/agents", {
        name: "coordinator",
        model: "claude-sonnet-4-8",
        multiagent: {
          type: "coordinator",
          agents: [{ type: "self", z: 1, a: 2 }],
        },
      }),
    ).toBe('Failed to parse request body: unknown field "a"');
  });

  it("byte order is UTF-8's, as Go compares strings, not UTF-16's", async () => {
    // U+FF5E is EF BD 9E in UTF-8 and U+1F600 is F0 9F 98 80, so the former
    // is less; in UTF-16 the emoji's high surrogate (D83D) sorts first.
    expect(await refusal("/v1/agents", { "\u{1F600}": 1, "～": 2 })).toBe(
      'Failed to parse request body: unknown field "～"',
    );
  });

  // sessionresources.go addSessionResourceTx → requiredString, then the
  // reference's sentence for a type that is not "file".
  it.each([
    [{}, "type is required"],
    [{ type: null }, "type is required"],
    [{ type: "" }, "type is required"],
    [{ type: 1 }, "type must be a string"],
    [{ type: { name: "file" } }, "type must be a string"],
    [
      { type: "memory_store" },
      'Failed to parse request: type: "memory_store" is not a valid value',
    ],
  ])(
    "adding a resource %j is refused in the platform's words",
    async (body, message) => {
      expect(
        await refusal(
          `/v1/sessions/${fixtures.sessions[0].id}/resources`,
          body,
        ),
      ).toBe(message);
    },
  );

  it("events: the posted echoes and the events the mock then appends", async () => {
    const id = "sesn_gatedbash00000000001"; // parked on requires_action
    const posted = (await postJSON(`/v1/sessions/${id}/events`, {
      events: [
        {
          type: "user.tool_confirmation",
          tool_use_id: "sevt_000000000000000005",
          result: "allow",
        },
      ],
    })) as { data: unknown[] };
    each(SessionEventSchema, posted.data, `POST /v1/sessions/${id}/events`);

    // Answering the ask makes the mock append an agent.tool_result and a
    // status event — appendEvent-constructed shapes no fixture covers.
    const listed = (await call(`/v1/sessions/${id}/events?limit=1000`, {
      method: "GET",
    })) as { data: unknown[] };
    each(SessionEventSchema, listed.data, `GET /v1/sessions/${id}/events`);
    expect(
      listed.data.some(
        (event) => (event as { type: string }).type === "agent.tool_result",
      ),
    ).toBe(true);
  });

  // The platform's #841 statuses (managed-agent-platform 91fb7293), each
  // refusal asserted whole, status and type included. route.go RouteInbound
  // and inbound.go threadClaim: an interrupt's session_thread_id that is no
  // thread id is the reference's 400, a well-formed one naming no thread of
  // the session its 404, and one that is not a string is refused on its type.
  it.each([
    [
      "sth_01HbamSkv49mRn4JHt9ryS6T",
      400,
      "invalid_request_error",
      "Invalid session_thread_id: sth_01HbamSkv49mRn4JHt9ryS6T",
    ],
    // The I in its token is what makes it malformed (domain.WellFormedID).
    [
      "sthr_01UnknownThreadIdXXXXXXXXX",
      400,
      "invalid_request_error",
      "Invalid session_thread_id: sthr_01UnknownThreadIdXXXXXXXXX",
    ],
    [
      "sthr_01DdMGc4KudV1Z22t2L7Y9QH",
      404,
      "not_found_error",
      "Thread not found: sthr_01DdMGc4KudV1Z22t2L7Y9QH",
    ],
    // Another session's child.
    [
      "sthr_taskrunnerresearch0001",
      404,
      "not_found_error",
      "Thread not found: sthr_taskrunnerresearch0001",
    ],
    [
      7,
      400,
      "invalid_request_error",
      "events[0]: session_thread_id must be a string or null",
    ],
  ])(
    "an interrupt naming %j is refused in the platform's words",
    async (claim, status, type, message) => {
      const response = await fetch(
        `${base}/v1/sessions/sesn_gatedbash00000000001/events`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": API_KEY,
          },
          body: JSON.stringify({
            events: [{ type: "user.interrupt", session_thread_id: claim }],
          }),
        },
      );
      expect(response.status).toBe(status);
      expect((await response.json()).error).toEqual({ type, message });
    },
  );

  // internal/events inbound.go threadClaim, then route.go RouteInbound: every
  // claim is read for its shape before any thread is looked up, so a
  // malformed claim later in the batch outranks an unknown one before it.
  it("an interrupt's claim is read for its shape before any thread is looked up", async () => {
    expect(
      await answer("POST", "/v1/sessions/sesn_gatedbash00000000001/events", {
        events: [
          {
            type: "user.interrupt",
            session_thread_id: "sthr_01DdMGc4KudV1Z22t2L7Y9QH",
          },
          { type: "user.interrupt", session_thread_id: "sth_x" },
        ],
      }),
    ).toEqual(invalid("Invalid session_thread_id: sth_x"));
  });

  it("an interrupt naming a fixture child thread is routed to it", async () => {
    resetStore();
    await fetch(`${base}/__multiagent`, { method: "POST" });
    const posted = (await postJSON(
      "/v1/sessions/sesn_research0000000000001/events",
      {
        events: [
          {
            type: "user.interrupt",
            session_thread_id: "sthr_membera0000000000001",
          },
        ],
      },
    )) as { data: { session_thread_id: string | null }[] };
    expect(posted.data[0].session_thread_id).toBe("sthr_membera0000000000001");
    resetStore();
  });

  // events.go sendSessionEvents and internal/events normalizeBatch: each
  // sub-case of a batch's shape in its own words, the reference's where it
  // was recorded (#540), and a management credential's user.tool_result its
  // 403 (#662).
  const userMessage = {
    type: "user.message",
    content: [{ type: "text", text: "Hello." }],
  };
  it.each([
    [{ events: [] }, invalid("events: must contain at least 1 item")],
    [{ events: null }, invalid("events: must contain at least 1 item")],
    [{}, invalid("events must be an array")],
    [{ events: {} }, invalid("events must be an array")],
    [[], invalid("request body must be a JSON object")],
    [{ events: [7] }, invalid("events[0]: event must be a JSON object")],
    [{ events: [{}] }, invalid("events[0]: type is required")],
    [{ events: [{ type: 7 }] }, invalid("events[0]: type must be a string")],
    [
      { events: [{ type: "agent.message", content: [] }] },
      invalid(
        'Failed to parse request: events[0].type: "agent.message" is not a valid value',
      ),
    ],
    [
      { events: [userMessage, { type: "user.bogus" }] },
      invalid(
        'Failed to parse request: events[1].type: "user.bogus" is not a valid value',
      ),
    ],
    [
      { events: [{ type: "user.tool_result", tool_use_id: "sevt_x" }] },
      {
        status: 403,
        retry: null,
        error: {
          type: "permission_error",
          message:
            "events[0]: `user.tool_result` may only be sent with environment credentials (the self-hosted runner's Session-Instance JWT); an API key or Console session cannot post this event type",
        },
      },
    ],
  ])(
    "events: a batch %j is refused in the platform's words",
    async (body, refused) => {
      expect(
        await answer(
          "POST",
          "/v1/sessions/sesn_gatedbash00000000001/events",
          body,
        ),
      ).toEqual(refused);
    },
  );

  // events.go sendSessionEvents reads the body (decodeObject, the unknown
  // keys, rawList) before it looks the session up, and the batch's floor
  // after.
  it("events: the body is read before the session, the floor after", async () => {
    const send = (session: string, body: string) =>
      fetch(`${base}/v1/sessions/${session}/events`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": API_KEY },
        body,
      }).then(async (response) => ({
        status: response.status,
        retry: response.headers.get("x-should-retry"),
        error: ((await response.json()) as { error: unknown }).error,
      }));
    expect(await send("sesn_absent", "{not json")).toEqual(
      invalid("request body must be a JSON object"),
    );
    expect(await send("sesn_absent", '{"events":[],"z":1}')).toEqual(
      invalid('Failed to parse request body: unknown field "z"'),
    );
    expect(await send("sesn_absent", '{"events":{}}')).toEqual(
      invalid("events must be an array"),
    );
    expect(await send("sesn_absent", '{"events":[]}')).toEqual(
      notFound("session sesn_absent not found"),
    );
    expect(await send("session_absent", "")).toEqual(
      invalid("events must be an array"),
    );
    resetStore();
    await call("/v1/sessions/sesn_gatedbash00000000001/archive", {
      method: "POST",
    });
    expect(await send("sesn_gatedbash00000000001", '{"events":[]}')).toEqual(
      invalid("session sesn_gatedbash00000000001 is archived and read-only"),
    );
    resetStore();
  });

  // inbound.go answerClaim: a confirmation is written, and echoed, on the
  // thread of the call it answers, whatever thread it names.
  it.each([
    "sthr_memberb0000000000001", // another thread of the session
    "sthr_01DdMGc4KudV1Z22t2L7Y9QH", // no thread at all
    "sth_01HbamSkv49mRn4JHt9ryS6T", // no thread id at all
  ])("a confirmation naming %s lands on its call's thread", async (claim) => {
    resetStore();
    await fetch(`${base}/__multiagent`, { method: "POST" });
    const id = "sesn_research0000000000001";
    const alpha = "sthr_membera0000000000001";
    const posted = (await postJSON(`/v1/sessions/${id}/events`, {
      events: [
        {
          type: "user.tool_confirmation",
          tool_use_id: "sevt_membera0000000000001ask",
          result: "allow",
          session_thread_id: claim,
        },
      ],
    })) as { data: { id: string; session_thread_id: string | null }[] };
    expect(posted.data[0].session_thread_id).toBe(alpha);
    const thread = (await call(`/v1/sessions/${id}/threads/${alpha}/events`, {
      method: "GET",
    })) as { data: { id: string }[] };
    expect(thread.data.map((event) => event.id)).toContain(posted.data[0].id);
    resetStore();
  });

  // route.go RouteInbound: an interrupt naming a thread of the session that is
  // archived is refused at its index in the batch.
  it("an interrupt naming an archived thread is refused in the platform's words", async () => {
    resetStore();
    const id = "sesn_research0000000000001";
    const child = "sthr_taskrunnerresearch0001";
    await postJSON(`/v1/sessions/${id}/threads/${child}/archive`, {});
    const response = await fetch(`${base}/v1/sessions/${id}/events`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": API_KEY },
      body: JSON.stringify({
        events: [{ type: "user.interrupt", session_thread_id: child }],
      }),
    });
    expect(response.status).toBe(400);
    expect((await response.json()).error).toEqual({
      type: "invalid_request_error",
      message: `events[0]: thread ${child} is archived`,
    });
    resetStore();
  });

  // environments.go environmentStillReferenced: sessions alone holding an
  // environment refuse its delete with the reference's 409, every session
  // counted, under a header that keeps the SDK from retrying it.
  const deleteHeldEnvironment = async (query = "") => {
    resetStore();
    // The fixture deployment there is the platform's own 400 (below); moved
    // off, the sessions alone hold the environment.
    await postJSON("/v1/deployments/depl_weekresearch00000001", {
      environment_id: "env_byoc0000000000000001",
    });
    return fetch(`${base}/v1/environments/env_egress000000000000001${query}`, {
      method: "DELETE",
      headers: { "x-api-key": API_KEY },
    });
  };

  it("an environment its sessions hold refuses its delete with the 409", async () => {
    const refused = await deleteHeldEnvironment();
    expect(refused.status).toBe(409);
    expect(refused.headers.get("x-should-retry")).toBe("false");
    expect((await refused.json()).error).toEqual({
      type: "invalid_request_error",
      message:
        "Environment has 2 active sessions. Use force=true to delete anyway.",
    });
    // The count is the template's, "1 active sessions" too.
    await call("/v1/sessions/sesn_gatedbash00000000001", { method: "DELETE" });
    const again = await fetch(
      `${base}/v1/environments/env_egress000000000000001`,
      { method: "DELETE", headers: { "x-api-key": API_KEY } },
    );
    expect((await again.json()).error.message).toBe(
      "Environment has 1 active sessions. Use force=true to delete anyway.",
    );
    resetStore();
  });

  // page.go parseBoolParam, then the forced arm: force deletes no session
  // there, so the sessions refuse it under the same 409 and header in the
  // platform's own words. A value ParseBool does not take is the 400.
  it.each([
    [
      "true",
      409,
      "environment env_egress000000000000001 still has sessions; delete them first",
    ],
    [
      "1",
      409,
      "environment env_egress000000000000001 still has sessions; delete them first",
    ],
    [
      "false",
      409,
      "Environment has 2 active sessions. Use force=true to delete anyway.",
    ],
    ["maybe", 400, "force must be true or false"],
  ])(
    "a delete with force=%s is answered in the platform's words",
    async (force, status, message) => {
      const response = await deleteHeldEnvironment(`?force=${force}`);
      expect(response.status).toBe(status);
      expect(response.headers.get("x-should-retry")).toBe(
        status === 409 ? "false" : null,
      );
      expect((await response.json()).error).toEqual({
        type: "invalid_request_error",
        message,
      });
      resetStore();
    },
  );

  // environments.go environmentStillReferenced: any deployment in the way,
  // archived ones included, is the platform's own 400, forced or not, naming
  // up to five (archived first, then oldest) and counting the sessions
  // beside them; the remedy it names is the one that works.
  it("an environment a deployment holds refuses its delete with the platform's 400", async () => {
    resetStore();
    const byoc = "env_byoc0000000000000001";
    const cloud = "env_egress000000000000001";
    for (const query of ["", "?force=true"])
      expect(
        await answer("DELETE", `/v1/environments/${byoc}${query}`),
      ).toEqual(
        invalid(
          `environment ${byoc} is referenced by 1 deployment (depl_handtask00000000001); point each at another environment and the delete will go through`,
        ),
      );
    expect(await answer("DELETE", `/v1/environments/${cloud}`)).toEqual(
      invalid(
        `environment ${cloud} is referenced by 1 deployment (depl_weekresearch00000001) and 2 sessions; point each deployment at another environment and delete the sessions and the delete will go through`,
      ),
    );

    // Archived, a deployment can never move, and the advice is the archive
    // only until it is taken.
    await postJSON("/v1/deployments/depl_handtask00000000001/archive", {});
    const created: string[] = [];
    for (let i = 0; i < 6; i++)
      created.push(
        (
          (await postJSON("/v1/deployments", {
            ...deployment,
            environment_id: byoc,
          })) as { id: string }
        ).id,
      );
    const stuck = `environment ${byoc} is referenced by 7 deployments (depl_handtask00000000001, ${created.slice(0, 4).join(", ")} and 2 more), 1 of them archived and so unmovable; it can no longer be deleted`;
    expect(await answer("DELETE", `/v1/environments/${byoc}`)).toEqual(
      invalid(`${stuck} — archive it instead`),
    );
    await postJSON(`/v1/environments/${byoc}/archive`, {});
    expect(await answer("DELETE", `/v1/environments/${byoc}`)).toEqual(
      invalid(stuck),
    );
    resetStore();

    // Moved off, nothing holds it, and the delete goes through.
    await postJSON("/v1/deployments/depl_handtask00000000001", {
      environment_id: cloud,
    });
    expect(
      await call(`/v1/environments/${byoc}`, { method: "DELETE" }),
    ).toEqual({ id: byoc, type: "environment_deleted" });
    resetStore();
  });

  // Every fixture id is one the platform could have minted, so none of them
  // reads as malformed where the mock answers domain.WellFormedID's 400.
  it("every fixture id is well-formed", () => {
    const ids: string[] = [];
    const walk = (value: unknown, key: string) => {
      if (typeof value === "string") {
        if (/(^id|_ids?)$/.test(key) && /^[a-z]+_/.test(value)) ids.push(value);
      } else if (Array.isArray(value)) {
        for (const item of value) walk(item, key);
      } else if (value && typeof value === "object") {
        for (const [k, v] of Object.entries(value)) walk(v, k);
      }
    };
    for (const [name, value] of Object.entries(fixtures)) walk(value, name);
    walk(fixtures.multiagentScenario(false), "");
    walk(fixtures.multiagentScenario(true), "");
    expect(ids.length).toBeGreaterThan(50);
    expect(
      ids.filter((id) => !/^[a-z]+_[0-9A-HJ-NP-Za-km-z]+$/.test(id)),
    ).toEqual([]);
  });

  it("vaults: create, and a credential of each auth type", async () => {
    const vault = await postJSON("/v1/vaults", {
      display_name: "conformance",
    });
    expectConforms(VaultSchema, vault, "POST /v1/vaults");
    const id = (vault as { id: string }).id;

    // A sentinel, not the word "secret" — `client_secret_basic` is a legitimate
    // rendered value and would make a substring check pass vacuously.
    const SECRET = "sh-not-in-any-render";
    const auths = [
      {
        type: "mcp_oauth",
        mcp_server_url: "https://mcp.example.com",
        access_token: SECRET,
        refresh: {
          client_id: "cid",
          token_endpoint: "https://mcp.example.com/token",
          token_endpoint_auth: { type: "client_secret_basic" },
        },
      },
      {
        type: "static_bearer",
        mcp_server_url: "https://mcp.example.com",
        token: SECRET,
      },
      {
        type: "environment_variable",
        secret_name: "API_TOKEN",
        secret_value: SECRET,
        networking: { type: "limited", allowed_hosts: ["api.example.com"] },
      },
    ];
    for (const auth of auths) {
      const credential = await postJSON(`/v1/vaults/${id}/credentials`, {
        display_name: `${auth.type} credential`,
        auth,
      });
      expectConforms(
        VaultCredentialSchema,
        credential,
        `POST /v1/vaults/${id}/credentials (${auth.type})`,
      );
      // Secrets are write-only: the rendered document must not carry them.
      expect(JSON.stringify(credential)).not.toContain(SECRET);
    }

    const archived = await postJSON(`/v1/vaults/${id}/archive`, {});
    expectConforms(VaultSchema, archived, `POST /v1/vaults/${id}/archive`);
  });

  it("skills: upload, then a new version", async () => {
    const skill = await postMultipart(
      "/v1/skills",
      '----x\r\nContent-Disposition: form-data; name="display_name"\r\n\r\n' +
        "Conformance Skill\r\n----x--\r\n",
    );
    expectConforms(SkillSchema, skill, "POST /v1/skills");
    const id = (skill as { id: string }).id;

    const version = await postMultipart(
      `/v1/skills/${id}/versions`,
      '----x\r\nContent-Disposition: form-data; name="file"; filename="s.zip"\r\n\r\nPK\r\n----x--\r\n',
    );
    expectConforms(
      SkillVersionSchema,
      version,
      `POST /v1/skills/${id}/versions`,
    );
    const versionId = (version as { id: string }).id;
    const read = (path: string) =>
      fetch(`${base}${path}`, { headers: { "x-api-key": API_KEY } });
    expect(
      await (await read(`/v1/skills/${id}/versions/latest`)).json(),
    ).toEqual(version);
    expect(
      await (await read(`/v1/skills/${id}/versions/${versionId}`)).json(),
    ).toEqual(version);
    const remove = (path: string) =>
      fetch(`${base}${path}`, {
        method: "DELETE",
        headers: { "x-api-key": API_KEY },
      });
    expect(
      (await remove(`/v1/skills/${id}/versions/${versionId}`)).status,
    ).toBe(200);
    expect((await read(`/v1/skills/${id}/versions/${versionId}`)).status).toBe(
      404,
    );
    const originalId = (skill as { latest_version_id: string })
      .latest_version_id;
    expect(
      (await remove(`/v1/skills/${id}/versions/${originalId}`)).status,
    ).toBe(400);
    const remaining = await (
      await read(`/v1/skills/${id}/versions/${originalId}`)
    ).json();
    expectConforms(SkillVersionSchema, remaining, "protected version");
    expect(remaining.id).toBe(originalId);
    expect(
      await (await read(`/v1/skills/${id}/versions/latest`)).json(),
    ).toEqual(remaining);
    expect((await remove(`/v1/skills/${id}`)).status).toBe(200);
    expect((await read(`/v1/skills/${id}/versions/${originalId}`)).status).toBe(
      404,
    );
    expect((await read(`/v1/skills/${id}/versions/latest`)).status).toBe(404);
    expect((await read(`/v1/skills/${id}/versions`)).status).toBe(404);
  });

  // The mock's credential dispatch mirrors internal/api/server.go's, because
  // the console's BFF is written against that ordering: a mock that
  // authenticated more loosely would let a console bug through, and one that
  // authenticated more strictly would fail a console that is right.
  //
  // These are the assertions that keep the two aligned. Nothing in the default
  // e2e run reaches the human lane — that needs an identity provider, which is
  // plan 08 slice 5's — so this is where it is exercised until then.
  describe("credential dispatch", () => {
    /** Header and payload are decoded, never verified: this is a mock, and shape is what routes. */
    const jwt = (payload: object) => {
      const part = (value: object) =>
        Buffer.from(JSON.stringify(value)).toString("base64url");
      return `${part({ alg: "RS256" })}.${part(payload)}.c2ln`;
    };
    const live = () =>
      jwt({ sub: "u1", exp: Math.floor(Date.now() / 1000) + 60 });

    const get = (headers: Record<string, string>) =>
      fetch(`${base}/v1/agents`, { headers });

    it("accepts the management key, as it always has", async () => {
      expect((await get({ "x-api-key": API_KEY })).status).toBe(200);
      const wrong = await get({ "x-api-key": "nope" });
      expect(wrong.status).toBe(401);
      expect((await wrong.json()).error.message).toBe("invalid x-api-key");
    });

    it("accepts a JWT-shaped Bearer on the human lane", async () => {
      expect((await get({ authorization: `Bearer ${live()}` })).status).toBe(
        200,
      );
    });

    // server.go dispatchManagementAuth: a non-empty x-api-key wins outright and
    // the Bearer is never read. The console's BFF must therefore never send
    // both — this is the mock half of that assertion.
    it("gives a request carrying both to the management lane", async () => {
      const both = await get({
        "x-api-key": "nope",
        authorization: `Bearer ${live()}`,
      });
      expect(both.status).toBe(401);
      expect((await both.json()).error.message).toBe("invalid x-api-key");
    });

    // identitylane.go: a Bearer without the JWT silhouette is left for the
    // environment-key lane, which on a management path, for a key no
    // environment issued, falls through to requireAPIKey and its unchanged
    // message (envauth.go answerEnvironmentKey, #840). An unauthenticated
    // caller learns nothing about whether SSO is configured.
    it("does not read a non-JWT Bearer as a human credential", async () => {
      const key = await get({ authorization: "Bearer sk-map-env01-abc" });
      expect(key.status).toBe(401);
      expect((await key.json()).error.message).toBe(
        "x-api-key header is required",
      );
    });

    it("refuses an expired token, and one this platform has stopped accepting", async () => {
      const expired = await get({
        authorization: `Bearer ${jwt({ sub: "u1", exp: 1 })}`,
      });
      expect(expired.status).toBe(401);
      expect((await expired.json()).error.message).toBe(
        "authentication failed",
      );

      await fetch(`${base}/__expire-identity`, { method: "POST" });
      expect((await get({ authorization: `Bearer ${live()}` })).status).toBe(
        401,
      );
      // …and the hook is undone by the reset every spec already runs.
      resetStore();
      expect((await get({ authorization: `Bearer ${live()}` })).status).toBe(
        200,
      );
    });
  });
});
