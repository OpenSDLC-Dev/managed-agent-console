import { expect, test } from "@playwright/test";
import { signIn } from "./sign-in";

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18080/__reset");
});

test("creates a coordinator with an ordered roster", async ({ page }) => {
  await signIn(page);
  await page.goto("/agents/new");
  await page.getByLabel("Name").fill("Coordinator");
  await page.getByRole("button", { name: "Enable coordinator" }).click();
  await page
    .getByLabel("Agent", { exact: true })
    .selectOption("agent_taskrunner0000000001");
  await page.getByRole("button", { name: "Add member" }).click();
  await page.getByRole("button", { name: "Create agent", exact: true }).click();

  await expect(page).toHaveURL(/\/agents\/agent_mock/);
  const roster = page.getByTestId("agent-multiagent");
  await expect(roster).toBeVisible();
  const members = roster.locator("[data-roster-index]");
  await expect(members).toHaveCount(2);
  await expect(members.nth(0)).toHaveAttribute("data-roster-index", "0");
  await expect(members.nth(0)).toHaveAttribute("data-agent-id", /agent_mock/);
  await expect(members.nth(1)).toHaveAttribute("data-roster-index", "1");
  await expect(members.nth(1)).toHaveAttribute(
    "data-agent-id",
    "agent_taskrunner0000000001",
  );
  await expect(members.nth(1)).toHaveAttribute("data-agent-version", "1");
});

test("switches to a child trace and archives the idle child", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/sessions/sesn_research0000000000001");

  const child = page.locator('[data-thread-id="sthr_taskrunnerresearch0001"]');
  await expect(child).toHaveAttribute("data-thread-status", "idle");
  await child.getByRole("button").first().click();
  await expect(page.getByTestId("stream-state")).toHaveAttribute(
    "data-state",
    "live",
  );
  const attribution = page.locator(
    '[data-session-thread-id="sthr_taskrunnerresearch0001"]',
  );
  await expect(attribution).toHaveAttribute(
    "data-agent-name",
    "General task agent",
  );
  await expect(page.getByTestId("event-row")).toHaveCount(2);
  await page
    .getByTestId("events-toolbar")
    .getByRole("button", { name: "Status", exact: true })
    .click();
  await expect(
    page.locator('[data-event-type="session.thread_status_idle"]'),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "All", exact: true }).click();

  const childMessageStatus = await page.evaluate(async () => {
    const response = await fetch(
      "/api/platform/v1/sessions/sesn_research0000000000001/events",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          events: [
            {
              type: "user.message",
              content: [{ type: "text", text: "Route this to the child." }],
              session_thread_id: "sthr_taskrunnerresearch0001",
            },
          ],
        }),
      },
    );
    return response.status;
  });
  expect(childMessageStatus).toBe(400);

  await page.evaluate(async () => {
    await fetch("/api/platform/v1/sessions/sesn_research0000000000001/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        events: [
          {
            type: "user.interrupt",
            session_thread_id: "sthr_taskrunnerresearch0001",
          },
        ],
      }),
    });
  });
  await expect(page.locator('[data-event-type="user.interrupt"]')).toHaveCount(
    1,
  );

  await page
    .getByRole("button", { name: "Archive thread General task agent" })
    .click();
  await page.getByRole("button", { name: "Archive thread" }).click();
  await expect(child).toHaveAttribute("data-thread-status", "terminated");
  await expect(page.getByTestId("session-effective-status")).toHaveAttribute(
    "data-status",
    "terminated",
  );
  const terminatedThreadStatus = await page.evaluate(async () => {
    const response = await fetch(
      "/api/platform/v1/sessions/sesn_research0000000000001/events",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          events: [
            {
              type: "user.interrupt",
              session_thread_id: "sthr_taskrunnerresearch0001",
            },
          ],
        }),
      },
    );
    return response.status;
  });
  expect(terminatedThreadStatus).toBe(400);
});

test("rejects malformed roster members without crashing the mock", async ({
  request,
}) => {
  const response = await request.post("http://127.0.0.1:18080/v1/agents", {
    headers: { "x-api-key": "test-key" },
    data: {
      name: "Malformed coordinator",
      model: "claude-sonnet-4-8",
      multiagent: { type: "coordinator", agents: [null] },
    },
  });
  expect(response.status()).toBe(400);

  const stillAlive = await request.get("http://127.0.0.1:18080/v1/agents", {
    headers: { "x-api-key": "test-key" },
  });
  expect(stillAlive.status()).toBe(200);
});
