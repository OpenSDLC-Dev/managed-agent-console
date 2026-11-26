import { expect, test } from "@playwright/test";
import { signIn } from "./sign-in";
import { browserPost } from "./browser-write";
import { chooseModel } from "./choose-model";

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18080/__reset");
});

test("creates a coordinator with an ordered roster", async ({ page }) => {
  await signIn(page);
  await page.goto("/workspaces/default/agents/new");
  await page.getByLabel("Name").fill("Coordinator");
  await chooseModel(page);
  await page.getByRole("button", { name: "Multiagent", exact: true }).click();
  await page.getByRole("combobox", { name: "Add subagent" }).click();
  await page
    .getByRole("option", { name: "General task agent", exact: true })
    .click();
  await page.getByRole("button", { name: "Create agent", exact: true }).click();

  await expect(page).toHaveURL(/\/agents\/agent_mock/);
  const roster = page.getByTestId("agent-multiagent");
  await expect(roster).toBeVisible();
  const members = roster.locator("[data-roster-index]");
  await expect(members).toHaveCount(1);
  await expect(members.nth(0)).toHaveAttribute("data-roster-index", "0");
  await expect(members.nth(0)).toHaveAttribute(
    "data-agent-id",
    "agent_taskrunner0000000001",
  );
  await expect(members.nth(0)).toHaveAttribute("data-agent-version", "1");
});

test("switches to a child trace and archives the idle child", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(
    "/workspaces/default/sessions/sesn_research0000000000001?inspector=thread",
  );

  const child = page.locator('[data-thread-id="sthr_taskrunnerresearch0001"]');
  await expect(child).toHaveAttribute("data-thread-status", "idle");
  await child.getByRole("button").first().click();
  await expect(page.getByTestId("stream-state")).toHaveAttribute(
    "data-state",
    "live",
  );
  const attribution = page.locator(
    '[data-session-thread-id="sthr_taskrunnerresearch0001"][data-agent-name="General task agent"]',
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

  const eventsPath =
    "/api/organizations/default/proxy/v1/sessions/sesn_research0000000000001/events";
  const childMessage = await browserPost(page, eventsPath, {
    data: {
      events: [
        {
          type: "user.message",
          content: [{ type: "text", text: "Route this to the child." }],
          session_thread_id: "sthr_taskrunnerresearch0001",
        },
      ],
    },
  });
  expect(childMessage.status()).toBe(400);

  const interrupt = await browserPost(page, eventsPath, {
    data: {
      events: [
        {
          type: "user.interrupt",
          session_thread_id: "sthr_taskrunnerresearch0001",
        },
      ],
    },
  });
  expect(interrupt.ok()).toBe(true);
  await expect(page.locator('[data-event-type="user.interrupt"]')).toHaveCount(
    1,
  );

  await page.getByText("Thread API response", { exact: true }).click();
  await page
    .getByRole("button", { name: "Archive thread General task agent" })
    .click();
  await page.getByRole("button", { name: "Archive thread" }).click();
  await expect(child).toHaveAttribute("data-thread-status", "terminated");
  await expect(page.getByTestId("session-effective-status")).toHaveAttribute(
    "data-status",
    "running",
  );
  const terminatedThread = await browserPost(page, eventsPath, {
    data: {
      events: [
        {
          type: "user.interrupt",
          session_thread_id: "sthr_taskrunnerresearch0001",
        },
      ],
    },
  });
  expect(terminatedThread.status()).toBe(400);
});

test("rejects malformed roster members without crashing the mock", async ({
  request,
}) => {
  const response = await request.post("http://127.0.0.1:18080/v1/agents", {
    headers: {
      "x-api-key": "sk-map-api01-mock-owned-test-key-00000000000000000000001",
    },
    data: {
      name: "Malformed coordinator",
      model: "claude-sonnet-4-8",
      multiagent: { type: "coordinator", agents: [null] },
    },
  });
  expect(response.status()).toBe(400);

  const stillAlive = await request.get("http://127.0.0.1:18080/v1/agents", {
    headers: {
      "x-api-key": "sk-map-api01-mock-owned-test-key-00000000000000000000001",
    },
  });
  expect(stillAlive.status()).toBe(200);
});
