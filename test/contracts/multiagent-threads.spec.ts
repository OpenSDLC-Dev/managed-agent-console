import { expect, type APIResponse } from "@playwright/test";
import { test } from "./fixtures";
import {
  AgentSchema,
  SessionSchema,
  SessionThreadSchema,
} from "../../src/lib/platform/schemas";

// Roster resolution and the primary-thread API need no worker or model turn.
test("coordinator rosters resolve into session snapshots and threads", async ({
  request,
}) => {
  const name = `multiagent-contract-${Date.now()}`;
  const ok = async (response: APIResponse) => {
    expect(response.status(), `Unexpected status for ${response.url()}`).toBe(
      200,
    );
    return response.json();
  };

  const member = AgentSchema.parse(
    await ok(
      await request.post("/v1/agents", {
        data: { name: `${name}-member`, model: "claude-sonnet-4-8" },
      }),
    ),
  );
  let coordinatorId: string | undefined;
  let environmentId: string | undefined;
  let sessionId: string | undefined;
  try {
    const coordinator = AgentSchema.parse(
      await ok(
        await request.post("/v1/agents", {
          data: {
            name: `${name}-coordinator`,
            model: "claude-sonnet-4-8",
            multiagent: {
              type: "coordinator",
              agents: [
                { type: "self" },
                { type: "agent", id: member.id, version: member.version },
              ],
            },
          },
        }),
      ),
    );
    coordinatorId = coordinator.id;
    expect(coordinator.multiagent?.agents).toEqual([
      { type: "agent", id: coordinator.id, version: coordinator.version },
      { type: "agent", id: member.id, version: member.version },
    ]);

    const environment = await ok(
      await request.post("/v1/environments", {
        data: { name, config: { type: "self_hosted" } },
      }),
    );
    environmentId = environment.id;
    const session = SessionSchema.parse(
      await ok(
        await request.post("/v1/sessions", {
          data: { agent: coordinator.id, environment_id: environmentId },
        }),
      ),
    );
    sessionId = session.id;
    expect(session.agent.multiagent?.agents.map((agent) => agent.id)).toEqual([
      coordinator.id,
      member.id,
    ]);

    const page = await ok(
      await request.get(`/v1/sessions/${session.id}/threads?limit=1000`),
    );
    expect(page.data).toHaveLength(1);
    const primary = SessionThreadSchema.parse(page.data[0]);
    expect(primary.parent_thread_id).toBeNull();
    expect(primary.agent.id).toBe(coordinator.id);

    const cleared = AgentSchema.parse(
      await ok(
        await request.post(`/v1/agents/${coordinator.id}`, {
          data: { version: coordinator.version, multiagent: null },
        }),
      ),
    );
    expect(cleared.multiagent).toBeNull();
  } finally {
    try {
      if (sessionId)
        await ok(await request.delete(`/v1/sessions/${sessionId}`));
    } finally {
      try {
        if (environmentId)
          await ok(await request.delete(`/v1/environments/${environmentId}`));
      } finally {
        if (coordinatorId)
          await ok(
            await request.post(`/v1/agents/${coordinatorId}/archive`, {
              data: {},
            }),
          );
        await ok(
          await request.post(`/v1/agents/${member.id}/archive`, { data: {} }),
        );
      }
    }
  }
});
