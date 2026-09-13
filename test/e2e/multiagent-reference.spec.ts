import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./sign-in";

const session = "sesn_research0000000000001";
const alpha = "sthr_multiagentalpha00001";
const beta = "sthr_multiagentbeta00001";
const route = `/sessions/${session}?inspector=thread`;
test.beforeEach(async ({ request }) => {
  expect((await request.post("http://127.0.0.1:18080/__reset")).ok()).toBe(
    true,
  );
  expect((await request.post("http://127.0.0.1:18080/__multiagent")).ok()).toBe(
    true,
  );
});

test("child selection survives reload and browser history while approval stays in the parent", async ({
  page,
}) => {
  const posted: unknown[] = [];
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      request.url().endsWith(`/sessions/${session}/events`)
    )
      posted.push(request.postDataJSON());
  });
  await signIn(page, route + "&source=recording7");
  await expect(
    page.getByRole("button", { name: "Approve", exact: true }),
  ).toHaveCount(2);
  for (const [id, name] of [
    [alpha, "Alpha"],
    [beta, "Beta"],
  ]) {
    await expect(
      page.locator(
        `[data-testid="event-row"][data-event-id="sevt_${id}tool"] [data-event-actor]`,
      ),
    ).toHaveAttribute("data-event-actor", name);
  }
  await page
    .getByRole("button", { name: "Child thread Alpha", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`source=recording7&thread=${alpha}`));
  await expect(
    page.getByText("Requires approval", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Approve", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Thread details" }).getByRole("link"),
  ).toHaveAttribute("href", "/agents/agent_alpha00000000000001?version=1");
  await page.reload();
  await expect(page.locator("[data-viewing-thread-id]")).toHaveAttribute(
    "data-viewing-thread-id",
    alpha,
  );
  await expect(
    page.getByText("Requires approval", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Child thread Beta", exact: true })
    .click();
  await expect(page.locator("[data-viewing-thread-id]")).toHaveAttribute(
    "data-viewing-thread-id",
    beta,
  );
  await page.goBack();
  await expect(page.locator("[data-viewing-thread-id]")).toHaveAttribute(
    "data-viewing-thread-id",
    alpha,
  );
  await page.goForward();
  await expect(page.locator("[data-viewing-thread-id]")).toHaveAttribute(
    "data-viewing-thread-id",
    beta,
  );
  await expect(page.locator("[data-timeline-thread-id]")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Parent thread", exact: true })
    .click();
  await expect(page).not.toHaveURL(/thread=sthr/);
  await page
    .locator(`[data-event-id="sevt_${alpha}tool"][data-testid="event-row"]`)
    .getByRole("button", { name: "Approve", exact: true })
    .click();
  await page
    .locator(`[data-event-id="sevt_${beta}tool"][data-testid="event-row"]`)
    .getByRole("button", { name: "Deny", exact: true })
    .click();
  await expect
    .poll(() => posted)
    .toEqual([
      {
        events: [
          {
            type: "user.tool_confirmation",
            tool_use_id: `sevt_${alpha}tool`,
            result: "allow",
          },
        ],
      },
      {
        events: [
          {
            type: "user.tool_confirmation",
            tool_use_id: `sevt_${beta}tool`,
            result: "deny",
          },
        ],
      },
    ]);
  for (const name of ["Alpha", "Beta"]) {
    await page
      .getByRole("button", { name: `Child thread ${name}`, exact: true })
      .click();
    await expect(page.getByTestId("stream-state")).toHaveAttribute(
      "data-state",
      "live",
    );
    await expect(
      page.getByText("Requires approval", { exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Approve", exact: true }),
    ).toHaveCount(0);
  }
  await page
    .getByRole("button", { name: "From Deep researcher", exact: true })
    .click();
  await expect(page).not.toHaveURL(/thread=sthr/);
});

test("Interrupt from a running child stops the Session and both children; Archive still targets the Session", async ({
  page,
  request,
}) => {
  await request.post("http://127.0.0.1:18080/__multiagent?running=true");
  await signIn(page, route + `&thread=${alpha}`);
  const message = page.getByRole("textbox", { name: "Child thread message" });
  await expect(message).toHaveAttribute("readonly", "");
  const posted = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      request.url().endsWith(`/sessions/${session}/events`),
  );
  await page
    .getByRole("button", { name: "Interrupt session", exact: true })
    .click();
  expect((await posted).postDataJSON()).toEqual({
    events: [{ type: "user.interrupt" }],
  });
  await expect(page.getByTestId("session-effective-status")).toHaveAttribute(
    "data-status",
    "idle",
  );
  for (const id of [alpha, beta]) {
    await expect(page.locator(`[data-thread-id="${id}"]`)).toHaveAttribute(
      "data-thread-status",
      "idle",
    );
  }
  await expect
    .poll(async () =>
      (
        await (
          await page.request.get(`/api/platform/v1/sessions/${session}/threads`)
        ).json()
      ).data
        .filter(
          (thread: { parent_thread_id: string | null }) =>
            thread.parent_thread_id,
        )
        .map((thread: { status: string }) => thread.status),
    )
    .toEqual(["idle", "idle"]);
  await page.reload();
  await page.getByRole("button", { name: "More actions", exact: true }).click();
  const archive = page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      request.url().endsWith(`/sessions/${session}/archive`),
  );
  await page.getByRole("menuitem", { name: "Archive", exact: true }).click();
  await archive;
  await expect(page).toHaveURL(/\/sessions$/);
});

test("a narrow child inspector remains reachable without document overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 480, height: 900 });
  await signIn(page, route + `&thread=${beta}`);
  await expect(
    page.getByRole("region", { name: "Thread details" }),
  ).toHaveAttribute("data-inspected-thread-id", beta);
  await expect(
    page.getByRole("button", { name: "Child thread Beta", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(480);
});

for (const status of [404, 501]) {
  test(`a child bookmark falls back to Session when Threads returns ${status}`, async ({
    page,
  }) => {
    let childRequests = 0;
    page.on("request", (request) => {
      if (request.url().includes(`/sessions/${session}/threads/`))
        childRequests++;
    });
    await page.route(
      `**/api/platform/v1/sessions/${session}/threads?*`,
      (route) =>
        route.fulfill({
          status,
          contentType: "application/json",
          body: JSON.stringify({
            type: "error",
            error: { type: "not_found_error", message: "unsupported" },
          }),
        }),
    );
    await signIn(page, route + `&thread=${alpha}`);
    await expect(page.getByTestId("stream-state")).toHaveAttribute(
      "data-state",
      "live",
    );
    await expect(
      page.getByRole("button", { name: "Approve", exact: true }),
    ).toHaveCount(2);
    await expect(page.locator("[data-viewing-thread-id]")).toHaveCount(0);
    await expect(
      page.getByRole("tab", { name: "Threads", exact: true }),
    ).toHaveCount(0);
    expect(childRequests).toBe(0);
  });
}
