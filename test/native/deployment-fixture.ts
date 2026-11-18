import type { APIRequestContext } from "@playwright/test";

/** Real model-free deployment, paused before a scheduler can start work. */
export async function seedDeployment(request: APIRequestContext) {
  const session = await (await request.get("/api/auth/session")).json();
  const headers = {
    origin: "http://127.0.0.1:38200",
    "X-CSRF-Token": session.csrf_token,
  };
  const resource = "/api/organizations/default/proxy/v1";
  async function post(path: string, data?: unknown) {
    const response = await request.post(path, { headers, data });
    if (!response.ok())
      throw new Error(`deployment fixture ${path}: ${response.status()}`);
    return response.json();
  }
  const agent = await post(`${resource}/agents`, {
    name: "Scheduled research",
    model: "unused-model",
    system: "Fixture only",
  });
  const environment = await post(`${resource}/environments`, {
    name: "Scheduler fixture",
    config: { type: "self_hosted" },
  });
  const deployment = await post(`${resource}/deployments`, {
    name: "Weekly research",
    agent: agent.id,
    environment_id: environment.id,
    initial_events: [
      {
        type: "user.message",
        content: [{ type: "text", text: "Summarize the research" }],
      },
    ],
  });
  await post(`${resource}/deployments/${deployment.id}/pause`);
  const account = await post(
    "/api/console/organizations/default/service_accounts",
    {
      name: `schedule-bot-${deployment.id.replaceAll("_", "-").toLowerCase()}`,
    },
  );
  return { deployment, account, session };
}
