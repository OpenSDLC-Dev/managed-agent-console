// Mock of the platform's model gateway admin API (cmd/modelgateway,
// internal/modelgateway/admin/), plan 10. The mock platform server routes
// `/admin/v1/...` here after its own authentication, so the e2e console points
// MODEL_GATEWAY_BASE_URL at the same port. Shapes follow the admin views
// (src/lib/platform/schemas.ts cites them); the store rules the console has to
// render — 409 on a delete that something still names, 400 on a field fixed at
// creation — follow internal/modelgateway/store.

/** profile/profile.go — a subset; the display names are the platform's own. */
const PROFILES = [
  {
    type: "profile",
    name: "deepseek",
    display_name: "DeepSeek",
    protocols: ["anthropic", "openai"],
    hosts: [
      { protocol: "anthropic", base_url: "https://api.deepseek.com/anthropic" },
      { protocol: "openai", base_url: "https://api.deepseek.com" },
    ],
  },
  {
    type: "profile",
    name: "minimax",
    display_name: "MiniMax",
    protocols: ["anthropic", "openai"],
    hosts: [
      {
        protocol: "anthropic",
        region: "cn",
        base_url: "https://api.minimax.cn/anthropic",
      },
      {
        protocol: "anthropic",
        region: "international",
        base_url: "https://api.minimax.io/anthropic",
      },
      {
        protocol: "openai",
        region: "cn",
        base_url: "https://api.minimax.cn/v1",
      },
      {
        protocol: "openai",
        region: "international",
        base_url: "https://api.minimax.io/v1",
      },
    ],
  },
  {
    type: "profile",
    name: "gitee",
    display_name: "Gitee AI",
    protocols: ["openai"],
    hosts: [{ protocol: "openai", base_url: "https://ai.gitee.com/v1" }],
  },
  {
    type: "profile",
    name: "anthropic-generic",
    display_name: "Other Anthropic-compatible Endpoint",
    protocols: ["anthropic"],
    hosts: [],
  },
  {
    type: "profile",
    name: "openai-generic",
    display_name: "Other OpenAI-compatible Endpoint",
    protocols: ["openai"],
    hosts: [],
  },
];

const provider = (id, name, profile, endpoints, enabled = true) => ({
  type: "provider",
  id,
  name,
  profile,
  endpoints,
  headers: {},
  stall_timeout_ms: null,
  propagate_trace: false,
  enabled,
  created_at: "2026-10-08T09:00:00Z",
  updated_at: "2026-10-08T09:00:00Z",
});

const PROVIDERS = [
  provider("gwprov_deepseek01", "DeepSeek", "deepseek", {
    anthropic: "https://api.deepseek.com/anthropic",
    openai: "https://api.deepseek.com",
  }),
  provider("gwprov_minimaxcn1", "MiniMax CN", "minimax", {
    anthropic: "https://api.minimax.cn/anthropic",
    openai: "https://api.minimax.cn/v1",
  }),
  provider("gwprov_giteeai001", "Gitee AI", "gitee", {
    openai: "https://ai.gitee.com/v1",
  }),
  // Plain HTTP and disabled: the two states the providers list marks.
  provider(
    "gwprov_vllmlocal1",
    "vLLM in cluster",
    "anthropic-generic",
    { anthropic: "http://vllm.models.svc:8000" },
    false,
  ),
];

const credential = (id, providerId, lastFour, protocols, weight) => ({
  type: "credential",
  id,
  provider_id: providerId,
  kind: "api_key",
  last_four: lastFour,
  protocols,
  weight,
  enabled: true,
  created_at: "2026-10-08T09:05:00Z",
  updated_at: "2026-10-08T09:05:00Z",
});

const BOTH = ["anthropic", "openai"];

const CREDENTIALS = [
  credential("gwcred_ds000001", "gwprov_deepseek01", "a1f3", BOTH, 3),
  credential("gwcred_ds000002", "gwprov_deepseek01", "77d0", ["anthropic"], 1),
  credential("gwcred_mm000001", "gwprov_minimaxcn1", "8f2c", BOTH, 1),
  credential("gwcred_gt000001", "gwprov_giteeai001", "c4e9", ["openai"], 1),
  // Shorter than 12 characters: the platform publishes no tail at all.
  credential("gwcred_vl000001", "gwprov_vllmlocal1", "", ["anthropic"], 1),
];

const deployment = (id, providerId, upstream, kind, extra = {}) => ({
  type: "deployment",
  id,
  provider_id: providerId,
  upstream_model: upstream,
  kind,
  display_name: "",
  capabilities: { tools: false, thinking: false, vision: false },
  prices: { input: null, output: null, cache_write: null, cache_read: null },
  enabled: true,
  created_at: "2026-10-08T09:10:00Z",
  updated_at: "2026-10-08T09:10:00Z",
  ...extra,
});

const DEPLOYMENTS = [
  deployment(
    "gwdep_dsflash01",
    "gwprov_deepseek01",
    "deepseek-v4-flash",
    "chat",
    {
      capabilities: {
        tools: true,
        thinking: true,
        vision: false,
        max_input_tokens: 128000,
        max_tokens: 32000,
      },
      prices: { input: 1, output: 2, cache_write: null, cache_read: 0.1 },
    },
  ),
  deployment(
    "gwdep_dspro0001",
    "gwprov_deepseek01",
    "deepseek-v4-pro",
    "chat",
    {
      capabilities: {
        tools: true,
        thinking: true,
        vision: false,
        max_input_tokens: 128000,
        max_tokens: 64000,
      },
      prices: { input: 4, output: 16, cache_write: null, cache_read: 0.4 },
    },
  ),
  deployment("gwdep_mmm30001", "gwprov_minimaxcn1", "MiniMax-M3", "chat", {
    capabilities: {
      tools: true,
      thinking: true,
      vision: true,
      max_input_tokens: 200000,
      max_tokens: 64000,
    },
    prices: { input: 2.1, output: 8.4, cache_write: 2.6, cache_read: 0.21 },
  }),
  deployment(
    "gwdep_qwemb0001",
    "gwprov_giteeai001",
    "Qwen3-Embedding-0.6B",
    "embedding",
  ),
  deployment(
    "gwdep_bgerr0001",
    "gwprov_giteeai001",
    "bge-reranker-v2-m3",
    "rerank",
  ),
];

const alias = (name, displayName, kind, targets, createdAt) => ({
  type: "alias",
  name,
  display_name: displayName,
  kind,
  targets,
  created_at: createdAt,
  updated_at: createdAt,
});

const ALIASES = [
  alias(
    "agent-default",
    "Agent default",
    "chat",
    [
      { deployment_id: "gwdep_mmm30001", priority: 0, weight: 3 },
      { deployment_id: "gwdep_dspro0001", priority: 0, weight: 1 },
      { deployment_id: "gwdep_dsflash01", priority: 1, weight: 1 },
    ],
    "2026-10-12T08:00:00Z",
  ),
  alias(
    "deepseek-flash",
    "DeepSeek Flash",
    "chat",
    [{ deployment_id: "gwdep_dsflash01", priority: 0, weight: 1 }],
    "2026-10-09T08:00:00Z",
  ),
  alias(
    "minimax-m3",
    "MiniMax M3",
    "chat",
    [{ deployment_id: "gwdep_mmm30001", priority: 0, weight: 1 }],
    "2026-10-09T08:00:00Z",
  ),
  alias(
    "kb-embed",
    "KB embeddings",
    "embedding",
    [{ deployment_id: "gwdep_qwemb0001", priority: 0, weight: 1 }],
    "2026-10-08T08:00:00Z",
  ),
  alias(
    "kb-rerank",
    "KB rerank",
    "rerank",
    [{ deployment_id: "gwdep_bgerr0001", priority: 0, weight: 1 }],
    "2026-10-08T08:00:00Z",
  ),
];

/** Keyed by the mock platform's own API key ids (server.mjs API_KEYS_SEED). */
const KEY_POLICIES = [
  {
    type: "key_policy",
    api_key_id: "apikey_ci01",
    aliases: ["deepseek-flash", "minimax-m3"],
    rpm: 60,
    tpm: null,
    created_at: "2026-10-10T08:00:00Z",
    updated_at: "2026-10-10T08:00:00Z",
  },
];

const DAY = 86_400_000;

/**
 * usage.go dailyUsageView rows for the 14 UTC days ending today, so the
 * default 30-day read always finds them. The counts are a function of the
 * day's index alone, so two runs on one day render the same chart.
 */
function dailySeed(now) {
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const routes = [
    ["apikey_bootstrap01", "agent-default", "gwdep_mmm30001", 120, 2.1, 8.4],
    ["apikey_bootstrap01", "agent-default", "gwdep_dspro0001", 40, 4, 16],
    ["apikey_ci01", "deepseek-flash", "gwdep_dsflash01", 300, 1, 2],
    ["apikey_ci01", "minimax-m3", "gwdep_mmm30001", 25, 2.1, 8.4],
  ];
  const rows = [];
  for (let i = 13; i >= 0; i--) {
    const day = new Date(today - i * DAY).toISOString().slice(0, 10);
    const swing = 1 + ((i * 7) % 5) / 4;
    for (const [key, name, dep, base, inPrice, outPrice] of routes) {
      const requests = Math.round(base * swing);
      const input = requests * 18_000;
      const output = requests * 900;
      const cacheRead = requests * 9_000;
      rows.push({
        day,
        api_key_id: key,
        alias: name,
        deployment_id: dep,
        requests,
        errors: i % 4 === 0 ? 2 : 0,
        input_tokens: input,
        output_tokens: output,
        cache_write_tokens: 0,
        cache_read_tokens: cacheRead,
        cost:
          Math.round(
            ((input * inPrice + output * outPrice) / 1e6 +
              (cacheRead * inPrice) / 1e7) *
              1e4,
          ) / 1e4,
      });
    }
  }
  return rows;
}

const usage = (id, ago, row) => ({
  id,
  request_id: `req_gw${String(id).padStart(6, "0")}`,
  created_at: new Date(Date.now() - ago * 1000)
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z"),
  session_id: null,
  error_type: null,
  input_tokens: null,
  output_tokens: null,
  cache_write_tokens: null,
  cache_read_tokens: null,
  cost: null,
  ttft_ms: null,
  ...row,
});

/** usage.go usageView rows, newest first; one of each state the ledger shows. */
function ledgerSeed() {
  const brain = {
    api_key_id: "apikey_bootstrap01",
    protocol: "anthropic",
    endpoint: "messages",
  };
  return [
    usage(8, 30, {
      ...brain,
      model: "agent-default",
      alias: "agent-default",
      deployment_id: "gwdep_mmm30001",
      credential_id: "gwcred_mm000001",
      session_id: "sesn_01JA8MOCKGATEWAY000001",
      status: 200,
      input_tokens: 18204,
      output_tokens: 912,
      cache_write_tokens: 0,
      cache_read_tokens: 12000,
      cost: 0.0485,
      latency_ms: 8400,
      ttft_ms: 1200,
    }),
    usage(7, 75, {
      api_key_id: "apikey_ci01",
      model: "kb-embed",
      alias: "kb-embed",
      deployment_id: "gwdep_qwemb0001",
      credential_id: "gwcred_gt000001",
      protocol: "openai",
      endpoint: "embeddings",
      status: 200,
      input_tokens: 3840,
      output_tokens: 0,
      latency_ms: 600,
    }),
    usage(6, 130, {
      api_key_id: "apikey_ci01",
      model: "deepseek-flash",
      alias: "deepseek-flash",
      deployment_id: "gwdep_dsflash01",
      credential_id: "gwcred_ds000001",
      protocol: "openai",
      endpoint: "chat_completions",
      status: 429,
      error_type: "rate_limit_error",
      latency_ms: 12,
    }),
    usage(5, 190, {
      ...brain,
      model: "agent-default",
      alias: "agent-default",
      deployment_id: "gwdep_dspro0001",
      credential_id: "gwcred_ds000002",
      session_id: "sesn_01JA6MOCKGATEWAY000002",
      status: 502,
      error_type: "api_error",
      latency_ms: 31000,
    }),
  ];
}

let profiles;
let providers;
let credentials;
let deployments;
let aliases;
let keyPolicies;
let daily;
let ledger;
let counter;

export function resetGateway() {
  profiles = structuredClone(PROFILES);
  providers = structuredClone(PROVIDERS);
  credentials = structuredClone(CREDENTIALS);
  deployments = structuredClone(DEPLOYMENTS);
  aliases = structuredClone(ALIASES);
  keyPolicies = structuredClone(KEY_POLICIES);
  daily = dailySeed(new Date());
  ledger = ledgerSeed();
  counter = 1;
}
resetGateway();

/** A gateway as a fresh deployment starts it: profiles only. */
export function emptyGateway() {
  providers = [];
  credentials = [];
  deployments = [];
  aliases = [];
  keyPolicies = [];
}

/** The seeded collections, for the conformance suite. */
export const gatewayFixtures = () => ({
  profiles: PROFILES,
  providers: PROVIDERS,
  credentials: CREDENTIALS,
  deployments: DEPLOYMENTS,
  aliases: ALIASES,
  keyPolicies: KEY_POLICIES,
  daily: dailySeed(new Date()),
  ledger: ledgerSeed(),
});

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const nextId = (prefix) => `${prefix}mock${String(counter++).padStart(6, "0")}`;

const ok = (body) => ({ status: 200, body });
const fail = (status, type, message) => ({
  status,
  body: { type: "error", error: { type, message } },
});
const invalid = (message) => fail(400, "invalid_request_error", message);

/** providers.go stallTimeout: null is the default; else 1 to MaxInt32 ms. */
const stallRefusal = (ms) =>
  ms == null || (Number.isInteger(ms) && ms >= 1 && ms <= 2147483647)
    ? undefined
    : invalid("stall_timeout_ms must be between 1 and 2147483647");
const notFound = (message) => fail(404, "not_found_error", message);
const conflict = (message) => fail(409, "invalid_request_error", message);
const list = (data) => ok({ data });

/** admin.go decodePatch: a fixed field by name, then anything not mutable. */
function patchRefusal(body, fixed, mutable) {
  for (const key of Object.keys(body)) {
    if (fixed[key]) return invalid(fixed[key]);
    if (!mutable.includes(key)) {
      return invalid(
        `Failed to parse request body as JSON: unknown field "${key}"`,
      );
    }
    // admin.go patch.field: a null would decode to the zero value.
    if (
      body[key] === null &&
      !["headers", "stall_timeout_ms", "protocols"].includes(key)
    ) {
      return invalid(`${key} must not be null`);
    }
  }
  return undefined;
}

const atCreation = (...names) =>
  Object.fromEntries(names.map((n) => [n, `${n} is fixed at creation`]));

function apply(target, body) {
  Object.assign(target, body, { updated_at: nowIso() });
  return target;
}

/** store/aliases.go targetsKind: every target exists and all share one kind. */
function targetsKind(targets) {
  if (!Array.isArray(targets) || targets.length === 0) {
    return { error: invalid("targets needs at least one target") };
  }
  let kind;
  for (const t of targets) {
    const dep = deployments.find((d) => d.id === t.deployment_id);
    if (!dep) {
      return {
        error: invalid(`deployment "${t.deployment_id}" does not exist`),
      };
    }
    if (kind && dep.kind !== kind) {
      return {
        error: invalid(
          `targets mix kinds ${kind} and ${dep.kind}; an alias has one kind`,
        ),
      };
    }
    kind = dep.kind;
  }
  return { kind };
}

const withWeights = (targets) =>
  targets.map((t) => ({
    deployment_id: t.deployment_id,
    priority: t.priority ?? 0,
    weight: t.weight ?? 1,
  }));

function filterRows(rows, params) {
  return rows.filter((r) =>
    ["api_key_id", "alias", "deployment_id", "session_id"].every(
      (f) => !params.get(f) || r[f] === params.get(f),
    ),
  );
}

/**
 * Answers one admin request, or undefined for a path the admin API does not
 * serve. `rest` is the path after `/admin/v1/`; `body` is the parsed JSON.
 */
export function gatewayRoute(method, rest, params, body = {}) {
  const segments = rest.split("/");
  const [head, id, sub, subId] = segments;

  if (rest === "profiles" && method === "GET") return list(profiles);

  if (head === "providers" && segments.length === 1) {
    if (method === "GET") return list(providers);
    if (method === "POST") {
      const profile = profiles.find((p) => p.name === body.profile);
      if (!profile) {
        return invalid(
          `profile "${body.profile}" does not exist; GET /admin/v1/profiles lists them`,
        );
      }
      if (!body.name) return invalid("name is required");
      if (!body.endpoints || Object.keys(body.endpoints).length === 0) {
        return invalid(
          "endpoints needs at least one endpoint, keyed by protocol",
        );
      }
      const stall = stallRefusal(body.stall_timeout_ms);
      if (stall) return stall;
      const created = {
        type: "provider",
        id: nextId("gwprov_"),
        name: body.name,
        profile: profile.name,
        endpoints: body.endpoints,
        headers: body.headers ?? {},
        stall_timeout_ms: body.stall_timeout_ms ?? null,
        propagate_trace: body.propagate_trace ?? false,
        enabled: body.enabled ?? true,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      providers.push(created);
      return ok(created);
    }
  }

  if (head === "providers" && segments.length === 2) {
    const found = providers.find((p) => p.id === id);
    if (!found) return notFound(`provider "${id}" does not exist`);
    if (method === "GET") return ok(found);
    if (method === "POST") {
      const refused = patchRefusal(body, atCreation("profile", "endpoints"), [
        "name",
        "headers",
        "stall_timeout_ms",
        "propagate_trace",
        "enabled",
      ]);
      if (refused) return refused;
      const stall = stallRefusal(body.stall_timeout_ms);
      if (stall) return stall;
      // A null clears the headers, as the platform renders a nil map: {}.
      return ok(
        apply(
          found,
          "headers" in body ? { ...body, headers: body.headers ?? {} } : body,
        ),
      );
    }
    if (method === "DELETE") {
      const deps = deployments.filter((d) => d.provider_id === id);
      if (deps.length > 0) {
        return conflict(
          `provider "${id}" has deployments (${deps.map((d) => d.id).join(", ")}); delete them first`,
        );
      }
      providers = providers.filter((p) => p.id !== id);
      credentials = credentials.filter((c) => c.provider_id !== id);
      return ok({ type: "provider_deleted", id });
    }
  }

  if (head === "providers" && sub === "credentials") {
    if (!providers.some((p) => p.id === id)) {
      return notFound(`provider "${id}" does not exist`);
    }
    if (segments.length === 3) {
      if (method === "GET") {
        return list(credentials.filter((c) => c.provider_id === id));
      }
      if (method === "POST") {
        if (!body.key) return invalid("key is required");
        const key = String(body.key);
        // store/credentials.go credentialProtocols: left out is every protocol
        // the provider has an endpoint for, written out; empty is refused.
        const provider = providers.find((p) => p.id === id);
        if (Array.isArray(body.protocols) && body.protocols.length === 0) {
          return invalid(
            "protocols: an empty list names no protocol; leave it out for every protocol the provider has an endpoint for",
          );
        }
        const missing = (body.protocols ?? []).find(
          (p) => !provider.endpoints[p],
        );
        if (missing) {
          return invalid(
            `provider "${id}" has no ${missing} endpoint, so its keys cannot be used on ${missing}`,
          );
        }
        const created = {
          type: "credential",
          id: nextId("gwcred_"),
          provider_id: id,
          kind: "api_key",
          last_four: key.length < 12 ? "" : key.slice(-4),
          protocols: ["anthropic", "openai", "gemini"].filter((p) =>
            (body.protocols ?? Object.keys(provider.endpoints)).includes(p),
          ),
          weight: body.weight ?? 1,
          enabled: body.enabled ?? true,
          created_at: nowIso(),
          updated_at: nowIso(),
        };
        credentials.push(created);
        return ok(created);
      }
    }
    if (segments.length === 4) {
      const found = credentials.find(
        (c) => c.id === subId && c.provider_id === id,
      );
      if (!found) return notFound(`credential "${subId}" does not exist`);
      if (method === "GET") return ok(found);
      if (method === "POST") {
        const refused = patchRefusal(
          body,
          {
            key: "a credential's key is fixed; to rotate it, add a new credential and delete this one",
          },
          ["protocols", "weight", "enabled"],
        );
        if (refused) return refused;
        if (!("protocols" in body)) return ok(apply(found, body));
        // A null puts back every protocol the provider serves, as on create.
        const provider = providers.find((p) => p.id === id);
        return ok(
          apply(found, {
            ...body,
            protocols: ["anthropic", "openai", "gemini"].filter((p) =>
              (body.protocols ?? Object.keys(provider.endpoints)).includes(p),
            ),
          }),
        );
      }
      if (method === "DELETE") {
        credentials = credentials.filter((c) => c.id !== subId);
        return ok({ type: "credential_deleted", id: subId });
      }
    }
  }

  if (head === "deployments" && segments.length === 1) {
    if (method === "GET") return list(deployments);
    if (method === "POST") {
      if (!providers.some((p) => p.id === body.provider_id)) {
        return invalid(`provider "${body.provider_id}" does not exist`);
      }
      if (!body.upstream_model) return invalid("upstream_model is required");
      if (!["chat", "embedding", "rerank"].includes(body.kind)) {
        return invalid("kind is required: chat, embedding or rerank");
      }
      const created = {
        type: "deployment",
        id: nextId("gwdep_"),
        provider_id: body.provider_id,
        upstream_model: body.upstream_model,
        kind: body.kind,
        display_name: body.display_name ?? "",
        capabilities: {
          tools: false,
          thinking: false,
          vision: false,
          ...body.capabilities,
        },
        prices: {
          input: null,
          output: null,
          cache_write: null,
          cache_read: null,
          ...body.prices,
        },
        enabled: body.enabled ?? true,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      deployments.push(created);
      return ok(created);
    }
  }

  if (head === "deployments" && segments.length === 2) {
    const found = deployments.find((d) => d.id === id);
    if (!found) return notFound(`deployment "${id}" does not exist`);
    if (method === "GET") return ok(found);
    if (method === "POST") {
      const refused = patchRefusal(
        body,
        atCreation("provider_id", "upstream_model", "kind"),
        ["display_name", "capabilities", "prices", "enabled"],
      );
      if (refused) return refused;
      return ok(apply(found, body));
    }
    if (method === "DELETE") {
      const naming = aliases.filter((a) =>
        a.targets.some((t) => t.deployment_id === id),
      );
      if (naming.length > 0) {
        return conflict(
          `deployment "${id}" is a target of aliases (${naming.map((a) => a.name).join(", ")}); remove it from them first`,
        );
      }
      deployments = deployments.filter((d) => d.id !== id);
      return ok({ type: "deployment_deleted", id });
    }
  }

  if (head === "aliases" && segments.length === 1) {
    if (method === "GET") return list(aliases);
    if (method === "POST") {
      if (!body.name) return invalid("name is required");
      if (aliases.some((a) => a.name === body.name)) {
        return conflict(`alias "${body.name}" already exists`);
      }
      const { kind, error } = targetsKind(body.targets);
      if (error) return error;
      if (kind === "embedding" && body.targets.length !== 1) {
        return invalid(
          "an embedding alias has exactly one deployment: an index built through it would mix vector spaces",
        );
      }
      const created = alias(
        body.name,
        body.display_name ?? "",
        kind,
        withWeights(body.targets),
        nowIso(),
      );
      aliases.push(created);
      return ok(created);
    }
  }

  if (head === "aliases" && segments.length > 1) {
    const name = segments.slice(1).join("/");
    const found = aliases.find((a) => a.name === name);
    if (!found) return notFound(`alias "${name}" does not exist`);
    if (method === "GET") return ok(found);
    if (method === "POST") {
      const refused = patchRefusal(body, atCreation("name", "kind"), [
        "display_name",
        "targets",
      ]);
      if (refused) return refused;
      if (body.targets !== undefined) {
        const { kind, error } = targetsKind(body.targets);
        if (error) return error;
        if (kind !== found.kind) {
          return invalid(
            `alias "${name}" routes to deployments of kind ${found.kind}; a target of kind ${kind} cannot join it`,
          );
        }
        if (
          found.kind === "embedding" &&
          (body.targets.length !== 1 ||
            body.targets[0].deployment_id !== found.targets[0].deployment_id)
        ) {
          return invalid(
            "an embedding alias's deployment is fixed at creation; a new embedding model is a new alias",
          );
        }
        return ok(
          apply(found, { ...body, targets: withWeights(body.targets) }),
        );
      }
      return ok(apply(found, body));
    }
    if (method === "DELETE") {
      const keys = keyPolicies
        .filter((k) => k.aliases?.includes(name))
        .map((k) => k.api_key_id);
      if (keys.length > 0) {
        return conflict(
          `alias "${name}" is granted to api keys (${keys.join(", ")}); remove it from their policies first`,
        );
      }
      aliases = aliases.filter((a) => a.name !== name);
      return ok({ type: "alias_deleted", name });
    }
  }

  if (head === "key_policies" && segments.length === 1 && method === "GET") {
    return list(keyPolicies);
  }

  if (head === "key_policies" && segments.length === 2) {
    const found = keyPolicies.find((k) => k.api_key_id === id);
    if (method === "GET") {
      return found ? ok(found) : notFound(`api key "${id}" has no policy`);
    }
    if (method === "POST") {
      // keypolicies.go putKeyPolicy: written whole, each field named.
      for (const field of ["aliases", "rpm", "tpm"]) {
        if (!(field in body)) {
          return invalid(
            `${field} is required; null grants every alias or sets no limit`,
          );
        }
      }
      const unknown = (body.aliases ?? []).find(
        (n) => !aliases.some((a) => a.name === n),
      );
      if (unknown !== undefined) {
        return invalid(`alias "${unknown}" does not exist`);
      }
      const written = {
        type: "key_policy",
        api_key_id: id,
        aliases: body.aliases,
        rpm: body.rpm,
        tpm: body.tpm,
        created_at: found?.created_at ?? nowIso(),
        updated_at: nowIso(),
      };
      keyPolicies = [
        ...keyPolicies.filter((k) => k.api_key_id !== id),
        written,
      ];
      return ok(written);
    }
    if (method === "DELETE") {
      if (!found) return notFound(`api key "${id}" has no policy`);
      keyPolicies = keyPolicies.filter((k) => k.api_key_id !== id);
      return ok({ type: "key_policy_deleted", api_key_id: id });
    }
  }

  // usage.go query: a parameter the read does not take, or one given empty,
  // is refused rather than dropped.
  const queryRefusal = (allowed) => {
    for (const [k, v] of params) {
      if (!allowed.includes(k))
        return invalid(`unknown query parameter "${k}"`);
      if (v === "") return invalid(`query parameter "${k}" is empty`);
    }
  };

  if (rest === "usage/daily" && method === "GET") {
    const refused = queryRefusal([
      "from",
      "to",
      "api_key_id",
      "alias",
      "deployment_id",
    ]);
    if (refused) return refused;
    const from = params.get("from");
    const to = params.get("to");
    return list(
      filterRows(daily, params).filter(
        (r) => (!from || r.day >= from) && (!to || r.day <= to),
      ),
    );
  }

  if (rest === "usage/requests" && method === "GET") {
    const refused = queryRefusal([
      "before",
      "limit",
      "api_key_id",
      "alias",
      "deployment_id",
      "session_id",
    ]);
    if (refused) return refused;
    const limit = Number(params.get("limit") ?? 100);
    const before = Number(params.get("before") ?? Infinity);
    const rows = filterRows(ledger, params).filter((r) => r.id < before);
    return ok({ data: rows.slice(0, limit), has_more: rows.length > limit });
  }

  return undefined;
}
