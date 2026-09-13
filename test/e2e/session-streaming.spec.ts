import { expect, test, type APIRequestContext } from "@playwright/test";
import { signIn } from "./sign-in";

const ROUTE = "/sessions/sesn_gatedbash00000000001";
const ID = "sevt_01HmTd92anY6GDkWZ1qMCiEM";
const step = async (request: APIRequestContext, name: string) => {
  expect(
    (
      await request.post(`http://127.0.0.1:18080/__live-preview?step=${name}`)
    ).ok(),
  ).toBe(true);
};
test.beforeEach(async ({ request, page }) => {
  await request.post("http://127.0.0.1:18080/__reset");
  await step(request, "setup");
  await signIn(page);
  await page.goto(ROUTE);
  await expect(page.getByTestId("stream-state")).toHaveAttribute(
    "data-state",
    "live",
  );
});

test("an empty archived Session reloads from empty history without requiring a terminal frame", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Archive", exact: true }).click();
  await expect(page).toHaveURL(/\/sessions$/);
  await page.goto(ROUTE);
  await expect(page.getByText("archived", { exact: true })).toBeVisible();
  await expect(page.getByTestId("stream-state")).toHaveAttribute(
    "data-state",
    "live",
  );
  await expect(page.getByTestId("event-row")).toHaveCount(0);
  await expect(page.getByTestId("preview-row")).toHaveCount(0);
});

test("thinking and growing text share the final message shell and reconcile by domain ID", async ({
  page,
  request,
}) => {
  await step(request, "thinking");
  const preview = page.getByTestId("preview-row");
  await expect(preview).toHaveAttribute("data-event-type", "agent.thinking");
  await expect(preview.locator("[data-event-actor]")).toHaveText(
    "General task agent",
  );
  await step(request, "text");
  await expect(preview).toHaveAttribute("data-event-id", ID);
  await expect(preview).toContainText("PREVIEW_001");
  await expect(preview).not.toContainText("PREVIEW_400");
  await step(request, "finish");
  await expect(preview).toHaveCount(0);
  const final = page
    .getByTestId("event-row")
    .and(page.locator(`[data-event-id="${ID}"]`));
  await expect(final).toHaveCount(1);
  await expect(final).toContainText("PREVIEW_400");
  await page.reload();
  await expect(page.getByTestId("stream-state")).toHaveAttribute(
    "data-state",
    "live",
  );
  await expect(final).toHaveCount(1);
  await expect(preview).toHaveCount(0);
});

test("a dropped preview clears and reconnect history recovers its one final message without a cursor", async ({
  page,
  request,
}) => {
  const streamRequests: { url: string; headers: Record<string, string> }[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/events/stream"))
      streamRequests.push({ url: req.url(), headers: req.headers() });
  });
  await step(request, "thinking");
  await step(request, "text");
  await expect(page.getByTestId("preview-row")).toContainText("PREVIEW_001");
  await step(request, "drop");
  await expect(page.getByTestId("stream-state")).toHaveAttribute(
    "data-state",
    "reconnecting",
  );
  await expect(page.getByTestId("preview-row")).toHaveCount(0);
  await step(request, "finish");
  await step(request, "resume");
  await expect(page.getByTestId("stream-state")).toHaveAttribute(
    "data-state",
    "live",
  );
  await expect(
    page.locator(`[data-testid="event-row"][data-event-id="${ID}"]`),
  ).toHaveCount(1);
  await expect(
    page.getByTestId("event-row").getByText(/PREVIEW_400$/),
  ).toBeVisible();
  expect(streamRequests.length).toBeGreaterThan(0);
  for (const req of streamRequests) {
    expect(new URL(req.url).searchParams.getAll("event_deltas[]")).toEqual([
      "agent.message",
      "agent.thinking",
    ]);
    expect(req.headers).not.toHaveProperty("last-event-id");
    expect([...new URL(req.url).searchParams.keys()]).toEqual([
      "event_deltas[]",
      "event_deltas[]",
    ]);
  }
});
