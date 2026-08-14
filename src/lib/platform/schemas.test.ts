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
  EnvironmentKeyIssuedSchema,
  EnvironmentKeyPageSchema,
  EnvironmentKeySchema,
  EnvironmentSchema,
  PlatformFileSchema,
  SessionEventSchema,
  SessionSchema,
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
  });

  it("environment keys (the console API)", () => {
    eachIn(EnvironmentKeySchema, fixtures.environmentKeys, "environmentKeys");
  });

  it("covers every collection the mock exports", () => {
    // A new fixture collection must be validated here, not silently skipped.
    expect(Object.keys(fixtures).sort()).toEqual([
      "agentVersions",
      "agents",
      "environmentKeys",
      "environments",
      "files",
      "sessionEvents",
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

  it("files: upload", async () => {
    const uploaded = await postMultipart(
      "/v1/files",
      '----x\r\nContent-Disposition: form-data; name="file"; filename="notes.md"\r\n' +
        "Content-Type: text/markdown\r\n\r\n# notes\r\n----x--\r\n",
    );
    expectConforms(PlatformFileSchema, uploaded, "POST /v1/files");
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
  });

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
      '----x\r\nContent-Disposition: form-data; name="display_title"\r\n\r\n' +
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
    // environment-key lane, which on a management path falls through to
    // requireAPIKey and its unchanged message. An unauthenticated caller learns
    // nothing about whether SSO is configured.
    it("does not read a non-JWT Bearer as a human credential", async () => {
      const key = await get({ authorization: "Bearer sk-map-env01-abc" });
      expect(key.status).toBe(401);
      expect((await key.json()).error.message).toBe("missing x-api-key header");
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
