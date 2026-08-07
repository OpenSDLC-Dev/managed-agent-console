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

  it("covers every collection the mock exports", () => {
    // A new fixture collection must be validated here, not silently skipped.
    expect(Object.keys(fixtures).sort()).toEqual([
      "agentVersions",
      "agents",
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
});
