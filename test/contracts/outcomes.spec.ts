import { expect, type APIResponse } from "@playwright/test";
import {
  SessionEventSchema,
  SessionSchema,
} from "../../src/lib/platform/schemas";
import { test } from "./fixtures";

// A self-hosted session with no worker keeps the outcome pending, so this
// checks acceptance, projection and interrupt settlement without a model call.
test("outcome definition and interrupt settlement", async ({ request }) => {
  const name = `outcome-contract-${Date.now()}`;
  const ok = async (response: APIResponse) => {
    expect(response.status(), `Unexpected status for ${response.url()}`).toBe(
      200,
    );
    return response.json();
  };
  const agent = await ok(
    await request.post("/v1/agents", {
      data: { name, model: "claude-sonnet-4-8" },
    }),
  );
  let environmentId: string | undefined;
  let sessionId: string | undefined;
  try {
    const environment = await ok(
      await request.post("/v1/environments", {
        data: { name, config: { type: "self_hosted" } },
      }),
    );
    environmentId = environment.id;
    const created = await ok(
      await request.post("/v1/sessions", {
        data: { agent: agent.id, environment_id: environmentId, title: name },
      }),
    );
    sessionId = created.id;
    const eventsPath = `/v1/sessions/${sessionId}/events`;
    const definition = {
      type: "user.define_outcome",
      description: "Produce a tested patch",
      rubric: { type: "text", content: "Lint and tests pass." },
      max_iterations: 4,
    };
    const echo = await ok(
      await request.post(eventsPath, { data: { events: [definition] } }),
    );
    const defined = SessionEventSchema.parse(echo.data[0]);
    expect(defined).toMatchObject({
      ...definition,
      max_iterations: 4,
    });
    expect(defined.outcome_id).toMatch(/^outc_/);

    const pending = SessionSchema.parse(
      await ok(await request.get(`/v1/sessions/${sessionId}`)),
    );
    expect(pending.outcome_evaluations).toEqual([
      expect.objectContaining({
        outcome_id: defined.outcome_id,
        description: definition.description,
        result: "pending",
        iteration: 0,
        completed_at: null,
      }),
    ]);
    expect(
      (
        await request.post(eventsPath, {
          data: { events: [definition] },
        })
      ).status(),
    ).toBe(400);

    await ok(
      await request.post(eventsPath, {
        data: { events: [{ type: "user.interrupt" }] },
      }),
    );
    const interrupted = SessionSchema.parse(
      await ok(await request.get(`/v1/sessions/${sessionId}`)),
    );
    expect(interrupted.outcome_evaluations[0]).toMatchObject({
      result: "interrupted",
    });
    expect(interrupted.outcome_evaluations[0].completed_at).not.toBeNull();

    const log = await ok(
      await request.get(`${eventsPath}?types[]=span.outcome_evaluation_end`),
    );
    const end = SessionEventSchema.parse(log.data[0]);
    expect(end).toMatchObject({
      type: "span.outcome_evaluation_end",
      outcome_id: defined.outcome_id,
      result: "interrupted",
      iteration: 0,
    });
  } finally {
    try {
      if (sessionId)
        await ok(await request.delete(`/v1/sessions/${sessionId}`));
    } finally {
      try {
        if (environmentId)
          await ok(await request.delete(`/v1/environments/${environmentId}`));
      } finally {
        await ok(
          await request.post(`/v1/agents/${agent.id}/archive`, { data: {} }),
        );
      }
    }
  }
});
