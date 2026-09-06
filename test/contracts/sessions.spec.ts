import { expect, type APIResponse } from "@playwright/test";
import { test } from "./fixtures";
import { SessionSchema } from "../../src/lib/platform/schemas";

// Create no events and attach no worker: this suite never invokes a model.
test("session metadata patches, archive refusal and deletion", async ({ request }) => {
  const name = `session-contract-${Date.now()}`;
  const ok = async (response: APIResponse) => {
    expect(response.status(), `Unexpected status for ${response.url()}`).toBe(200);
    return response.json();
  };
  const agent = await ok(await request.post("/v1/agents", { data: { name, model: "claude-sonnet-4-8" } }));
  let environmentId: string | undefined;
  let sessionId: string | undefined;
  try {
    const environment = await ok(await request.post("/v1/environments", { data: { name, config: { type: "self_hosted" } } }));
    environmentId = environment.id;
    const created = await ok(await request.post("/v1/sessions", { data: { agent: agent.id, environment_id: environmentId, title: name } }));
    sessionId = created.id;
    SessionSchema.parse(created);
    const path = `/v1/sessions/${sessionId}`;
    const updated = SessionSchema.parse(await ok(await request.post(path, { data: { title: "Renamed", metadata: { owner: "ops", ticket: "42" } } })));
    expect(updated.title).toBe("Renamed");
    expect(updated.metadata).toEqual({ owner: "ops", ticket: "42" });
    const patched = await ok(await request.post(path, { data: { metadata: { ticket: null } } }));
    expect(patched.metadata).toEqual({ owner: "ops" });
    const unchanged = await ok(await request.post(path, { data: { metadata: null } }));
    expect(unchanged.metadata).toEqual({ owner: "ops" });
    const archived = SessionSchema.parse(await ok(await request.post(`${path}/archive`, { data: {} })));
    expect(archived.archived_at).not.toBeNull();
    expect((await request.post(path, { data: { title: "Cannot edit" } })).status()).toBe(400);
    await ok(await request.delete(path));
    sessionId = undefined;
    expect((await request.get(path)).status()).toBe(404);
  } finally {
    try {
      if (sessionId) await ok(await request.delete(`/v1/sessions/${sessionId}`));
    } finally {
      try {
        if (environmentId) await ok(await request.delete(`/v1/environments/${environmentId}`));
      } finally {
        // Agents have an archive endpoint, no delete endpoint.
        await ok(await request.post(`/v1/agents/${agent.id}/archive`, { data: {} }));
      }
    }
  }
});
