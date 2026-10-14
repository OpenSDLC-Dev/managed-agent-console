import {
  expect,
  request as pwRequest,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { resolveLiveEnv } from "./env";
import { signIn } from "./sign-in";

/**
 * Plan 10 slice 6: the gateway screens against the compose stack's REAL model
 * gateway, through the console's `/api/gateway` BFF.
 *
 * This file spends no model tokens. The vendor key is a dummy, the endpoint is
 * the discard port, and nothing here makes a model call. What the test makes
 * it deletes in the order the gateway requires; teardown sweeps, by RUN, what
 * a failure left behind.
 */

const { baseUrl, apiKey, gatewayUrl } = resolveLiveEnv();
const RUN = `live-e2e-${Date.now().toString(36)}`;
const UPSTREAM = `${RUN}-upstream`;
const KEYS = "organizations/default/workspaces/default/api_keys";

let api: APIRequestContext;

test.beforeAll(async () => {
  if (!gatewayUrl)
    throw new Error(
      "RUN_LIVE_CONSOLE_TESTS=1 is set but MODEL_GATEWAY_BASE_URL is missing. " +
        "The gateway spec fails rather than skips — point it at the stack's gateway (port 8090).",
    );
  api = await pwRequest.newContext();
});

/** One call through the console's own proxy, as the screens make it. */
async function bff(page: Page, method: string, path: string, data?: unknown) {
  const res = await page.request.fetch(`/api/${path}`, { method, data });
  expect(res.ok(), `${method} ${path}: ${await res.text()}`).toBe(true);
  return res.json();
}

test("a model made through the gateway BFF reaches the console's screens", async ({
  page,
}) => {
  await signIn(page);
  const gw = (method: string, path: string, data?: unknown) =>
    bff(page, method, `gateway/admin/v1/${path}`, data);

  const provider = await gw("POST", "providers", {
    name: RUN,
    profile: "openai-generic",
    endpoints: { openai: "http://127.0.0.1:9/v1" },
  });
  await gw("POST", `providers/${provider.id}/credentials`, {
    key: `sk-dummy-${RUN}`,
  });
  const deployment = await gw("POST", "deployments", {
    provider_id: provider.id,
    upstream_model: UPSTREAM,
    kind: "chat",
    capabilities: { tools: false, thinking: false, vision: false },
    prices: {},
  });
  await gw("POST", "aliases", {
    name: RUN,
    targets: [{ deployment_id: deployment.id, priority: 0, weight: 1 }],
  });

  // Add provider lists every vendor the real gateway publishes, so the
  // console's transcription parses each profile.
  const profiles = (await gw("GET", "profiles")).data as {
    display_name: string;
  }[];
  await page.goto("/providers");
  await page.getByRole("button", { name: "Add provider" }).click();
  const dialog = page.getByRole("dialog", { name: "Add provider" });
  for (const p of profiles)
    await expect(
      dialog.getByText(p.display_name, { exact: true }),
    ).toBeVisible();
  await page.keyboard.press("Escape");

  // Models lists it, and its inspector routes it to the upstream model.
  await page.goto(`/models?model=${encodeURIComponent(RUN)}`);
  await expect(page.getByText(UPSTREAM).first()).toBeVisible();

  // The agent editor offers it by name.
  await page.goto("/agents/new");
  await page.getByRole("combobox", { name: "Model", exact: true }).click();
  await expect(
    page.getByRole("option", { name: RUN, exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");

  // A key the console mints can be granted it, and API Keys shows the grant.
  const key = await bff(page, "POST", `console/${KEYS}`, { name: RUN });
  await gw("POST", `key_policies/${key.id}`, {
    aliases: [RUN],
    rpm: 60,
    tpm: null,
  });
  await page.goto("/api-keys");
  const access = page
    .getByRole("row")
    .filter({ hasText: RUN })
    .locator("[data-models]");
  await expect(access).toHaveAttribute("data-models", "1");
  await expect(access).toHaveAttribute("data-rpm", "60");

  // Usage reads the real rollups.
  await page.goto("/usage");
  await expect(page.locator("[data-requests]")).toBeVisible();

  await gw("DELETE", `key_policies/${key.id}`);
  await gw("DELETE", `aliases/${encodeURIComponent(RUN)}`);
  await gw("DELETE", `deployments/${deployment.id}`);
  await gw("DELETE", `providers/${provider.id}`);
  await bff(page, "POST", `console/${KEYS}/${key.id}`, { status: "archived" });
});

/**
 * Removes what this run made, read from the stack rather than remembered, so a
 * failure between two steps leaves nothing behind. Scoped to RUN; a cleanup
 * failure is a real failure.
 */
test.afterAll(async () => {
  const headers = { "x-api-key": apiKey };
  const failures: string[] = [];
  const send = async (
    what: string,
    method: string,
    url: string,
    data?: unknown,
  ) => {
    try {
      const res = await api.fetch(url, { method, headers, data });
      if (!res.ok()) failures.push(`${what}: HTTP ${res.status()}`);
      return res.ok() ? await res.json() : undefined;
    } catch (error) {
      failures.push(`${what}: ${String(error)}`);
    }
  };
  const admin = `${gatewayUrl}/admin/v1`;
  const keysUrl = `${baseUrl}/api/console/${KEYS}`;

  const keys = ((await send("listing keys", "GET", keysUrl)) ?? []) as {
    id: string;
    name?: string | null;
    status?: string;
  }[];
  const ours = keys.filter((k) => k?.name === RUN);
  const policies = ((
    await send("listing policies", "GET", `${admin}/key_policies`)
  )?.data ?? []) as { api_key_id: string }[];
  for (const p of policies)
    if (ours.some((k) => k.id === p.api_key_id))
      await send(
        `deleting policy ${p.api_key_id}`,
        "DELETE",
        `${admin}/key_policies/${p.api_key_id}`,
      );
  const aliases = ((await send("listing models", "GET", `${admin}/aliases`))
    ?.data ?? []) as { name: string }[];
  for (const a of aliases)
    if (a.name === RUN)
      await send(
        `deleting model ${a.name}`,
        "DELETE",
        `${admin}/aliases/${encodeURIComponent(a.name)}`,
      );
  const deployments = ((
    await send("listing upstream models", "GET", `${admin}/deployments`)
  )?.data ?? []) as { id: string; upstream_model: string }[];
  for (const d of deployments)
    if (d.upstream_model === UPSTREAM)
      await send(
        `deleting upstream model ${d.id}`,
        "DELETE",
        `${admin}/deployments/${d.id}`,
      );
  const providers = ((
    await send("listing providers", "GET", `${admin}/providers`)
  )?.data ?? []) as { id: string; name: string }[];
  for (const p of providers)
    if (p.name === RUN)
      await send(
        `deleting provider ${p.id}`,
        "DELETE",
        `${admin}/providers/${p.id}`,
      );
  for (const k of ours)
    if (k.status !== "archived")
      await send(`archiving key ${k.id}`, "POST", `${keysUrl}/${k.id}`, {
        status: "archived",
      });

  await api.dispose();
  expect(failures, "cleanup").toEqual([]);
});
