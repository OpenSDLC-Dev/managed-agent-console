import type { APIRequestContext } from "@playwright/test";
import { nativeDocker } from "./docker";

export const model = "slice4/model";
export const principals = ["principal_browser_one", "principal_browser_two"];

/** Real handlers and database; synthetic ledger rows, never a vendor call. */
export async function seedGateway(
  request: APIRequestContext,
  container: string,
) {
  const session = await (await request.get("/api/auth/session")).json();
  const headers = {
    origin: "http://127.0.0.1:38200",
    "X-CSRF-Token": session.csrf_token,
  };
  async function post(path: string, data: unknown) {
    const response = await request.post(`/admin/v1/${path}`, { headers, data });
    if (!response.ok())
      throw new Error(`gateway fixture ${path}: ${response.status()}`);
    return response.json();
  }
  const aliases = await (await request.get("/admin/v1/aliases")).json();
  if (!aliases.data.some((a: { name: string }) => a.name === model)) {
    const provider = await post("providers", {
      name: "slice4-provider",
      profile: "anthropic",
      endpoints: { anthropic: "https://example.invalid" },
    });
    const deployment = await post("deployments", {
      provider_id: provider.id,
      upstream_model: "fixture-model",
      kind: "chat",
    });
    await post("aliases", {
      name: model,
      targets: [{ deployment_id: deployment.id, priority: 0, weight: 1 }],
    });
  }
  await post(`rate_limits/${model}`, {
    requests_per_minute: 120,
    input_tokens_per_minute: 50000,
    output_tokens_per_minute: null,
  });
  // These rows deliberately have no current principal/key directory entries.
  // Historical attribution must survive deletion and must not be inferred.
  const seeded = nativeDocker([
    "exec",
    container,
    "psql",
    "-U",
    "postgres",
    "-d",
    "native_password",
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    `
    DELETE FROM modelgateway.usage WHERE request_id LIKE 'browser-slice4-%';
    DELETE FROM modelgateway.usage_actor_daily WHERE alias='slice4/model';
    INSERT INTO modelgateway.usage (request_id, principal_id, api_key_id, model, alias, deployment_id, credential_id, protocol, endpoint, status, input_tokens, output_tokens, cost, latency_us)
    VALUES
      ('browser-slice4-1','principal_browser_one','apikey_browser_one','slice4/model','slice4/model','gwdep_historical','gwcred_historical','anthropic','messages',200,200,20,0.12,100000),
      ('browser-slice4-2','principal_browser_two','apikey_browser_two','slice4/model','slice4/model','gwdep_historical','gwcred_historical','anthropic','messages',200,300,30,0.24,200000),
      ('browser-slice4-3',NULL,'apikey_historical','slice4/model','slice4/model','gwdep_historical','gwcred_historical','anthropic','messages',200,100,10,0.06,50000);
  `,
  ]);
  if (seeded.status !== 0)
    throw new Error(`gateway ledger fixture: ${seeded.stderr}`);
}
