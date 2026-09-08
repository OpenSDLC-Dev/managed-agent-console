import { expect, type APIResponse } from "@playwright/test";
import {
  AgentSchema,
  DeploymentRunSchema,
  DeploymentSchema,
  EnvironmentSchema,
  SessionSchema,
} from "../../src/lib/platform/schemas";
import { test } from "./fixtures";

// Control-plane only: the self-hosted environment has no worker attached, so
// the manual fire exercises session creation without invoking a model.
test("deployment lifecycle and persistent run history", async ({ request }) => {
  const stamp = Date.now();
  const ok = async (response: APIResponse) => {
    expect(response.status(), `Unexpected status for ${response.url()}`).toBe(
      200,
    );
    return response.json();
  };
  const removeSession = async (id: string) => {
    let response = await request.delete(`/v1/sessions/${id}`);
    if (response.status() === 400) {
      await ok(
        await request.post(`/v1/sessions/${id}/events`, {
          data: { events: [{ type: "user.interrupt" }] },
        }),
      );
      response = await request.delete(`/v1/sessions/${id}`);
    }
    await ok(response);
  };

  const agent = AgentSchema.parse(
    await ok(
      await request.post("/v1/agents", {
        data: {
          name: `deployment-contract-${stamp}`,
          model: "claude-sonnet-4-8",
        },
      }),
    ),
  );
  let deploymentId: string | undefined;
  let sessionId: string | undefined;
  try {
    const environmentPage = await ok(
      await request.get("/v1/environments?limit=100&include_archived=false"),
    );
    let environment = environmentPage.data.find(
      (candidate: { name: string; archived_at: string | null }) =>
        candidate.name === "deployment-contract-anchor" &&
        candidate.archived_at === null,
    );
    if (!environment) {
      environment = EnvironmentSchema.parse(
        await ok(
          await request.post("/v1/environments", {
            data: {
              name: "deployment-contract-anchor",
              config: { type: "self_hosted" },
            },
          }),
        ),
      );
    }

    const created = DeploymentSchema.parse(
      await ok(
        await request.post("/v1/deployments", {
          data: {
            name: `deployment-contract-${stamp}`,
            agent: {
              type: "agent",
              id: agent.id,
              version: agent.version,
            },
            environment_id: environment.id,
            initial_events: [
              { type: "user.message", content: "Contract-only task." },
            ],
            metadata: { phase: "created" },
            schedule: {
              type: "cron",
              expression: "0 9 * * 1",
              timezone: "UTC",
            },
          },
        }),
      ),
    );
    deploymentId = created.id;
    expect(created.agent).toEqual({
      type: "agent",
      id: agent.id,
      version: agent.version,
    });
    expect(created.schedule?.upcoming_runs_at.length).toBeGreaterThan(0);

    const updated = DeploymentSchema.parse(
      await ok(
        await request.post(`/v1/deployments/${created.id}`, {
          data: { description: "updated", metadata: { phase: "updated" } },
        }),
      ),
    );
    expect(updated.metadata).toEqual({ phase: "updated" });

    const paused = DeploymentSchema.parse(
      await ok(
        await request.post(`/v1/deployments/${created.id}/pause`, {
          data: {},
        }),
      ),
    );
    expect(paused).toMatchObject({
      status: "paused",
      paused_reason: { type: "manual" },
    });

    // Manual fires remain legal while scheduled fires are paused.
    const run = DeploymentRunSchema.parse(
      await ok(
        await request.post(`/v1/deployments/${created.id}/run`, { data: {} }),
      ),
    );
    expect(run).toMatchObject({
      deployment_id: created.id,
      trigger_context: { type: "manual" },
      error: null,
    });
    expect(run.session_id).not.toBeNull();
    if (!run.session_id)
      throw new Error("Deployment run did not create a session");
    sessionId = run.session_id;
    const session = SessionSchema.parse(
      await ok(await request.get(`/v1/sessions/${sessionId}`)),
    );
    expect(session).toMatchObject({
      deployment_id: created.id,
      title: "",
      metadata: {},
    });

    const runs = await ok(
      await request.get(
        `/v1/deployment_runs?deployment_id=${created.id}&trigger_type=manual&has_error=false`,
      ),
    );
    expect(
      runs.data.map((candidate: { id: string }) => candidate.id),
    ).toContain(run.id);

    await removeSession(sessionId);
    sessionId = undefined;
    const retainedRun = DeploymentRunSchema.parse(
      await ok(await request.get(`/v1/deployment_runs/${run.id}`)),
    );
    expect(retainedRun.session_id).toBeNull();
    expect(retainedRun.error).toBeNull();

    const resumed = DeploymentSchema.parse(
      await ok(
        await request.post(`/v1/deployments/${created.id}/unpause`, {
          data: {},
        }),
      ),
    );
    expect(resumed.status).toBe("active");
  } finally {
    if (sessionId) await removeSession(sessionId);
    if (deploymentId)
      await ok(
        await request.post(`/v1/deployments/${deploymentId}/archive`, {
          data: {},
        }),
      );
    await ok(
      await request.post(`/v1/agents/${agent.id}/archive`, { data: {} }),
    );
  }
});
