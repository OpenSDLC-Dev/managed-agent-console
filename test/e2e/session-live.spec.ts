import { expect, test, type Page } from "@playwright/test";

const GATED = "/sessions/sesn_gatedbash00000000001";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator("form[data-hydrated]").waitFor();
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/agents$/);
}

test.beforeEach(async ({ request }) => {
  // Restore the mock platform's fixtures — these tests mutate session state.
  await request.post("http://127.0.0.1:18080/__reset");
});

test("trace readability: chips, offsets, span durations, idle band, copy all", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signIn(page);
  await page.goto(GATED);
  await expect(page.getByTestId("stream-state")).toHaveAttribute(
    "data-state",
    "live",
    { timeout: 15_000 },
  );

  // The meta chip-row replaces the overview field table. Counters are read as
  // raw integers (see CLAUDE.md) — the rendered string has exactly one
  // dedicated assertion, in "token and duration formatting" below.
  const chips = page.getByTestId("session-chips");
  await expect(chips).toContainText("General task agent · v1");
  const usage = chips.getByTestId("usage-chip");
  await expect(usage).toHaveAttribute("data-input-tokens", "5412");
  await expect(usage).toHaveAttribute("data-output-tokens", "890");
  await expect(usage).toHaveAttribute("data-cache-read-tokens", "3100");

  // Span duration pairs start/end; offsets are relative to created_at —
  // the fixture idles 21h45m after the session was created.
  await expect(
    page
      .getByTestId("event-row")
      .filter({ hasText: "span.model_request_end" })
      .getByTitle("model request duration"),
  ).toHaveAttribute("data-duration-ms", "3000");
  // That an offset renders at all is structure; what it reads is formatting,
  // asserted once in "token and duration formatting".
  await expect(
    page
      .getByTestId("event-row")
      .filter({ hasText: "session.status_idle" })
      .getByTitle("since session creation"),
  ).toBeVisible();

  // Approving wakes the session; the real idle interval becomes a band.
  await page.getByRole("button", { name: "Allow" }).click();
  await expect(page.getByTestId("idle-band")).toContainText("Session idle ·", {
    timeout: 15_000,
  });

  // Copy all serializes the persisted trace.
  await page.getByRole("button", { name: "Copy all" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const parsed = JSON.parse(copied) as { id: string }[];
  expect(Array.isArray(parsed)).toBe(true);
  expect(parsed[0].id).toBe("sevt_000000000000000001");
});

test("a row opens the detail panel and Debug shows the raw wire", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(GATED);
  await expect(page.getByTestId("stream-state")).toHaveAttribute(
    "data-state",
    "live",
    { timeout: 15_000 },
  );

  // Clicking the span-end row opens the panel with its token usage.
  await page
    .getByTestId("event-row")
    .filter({ hasText: "span.model_request_end" })
    .click();
  const panel = page.getByTestId("event-detail");
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute(
    "data-event-type",
    "span.model_request_end",
  );
  await expect(panel).toHaveAttribute("data-input-tokens", "5412");
  await expect(panel).toHaveAttribute("data-output-tokens", "890");

  // The raw event expands to the verbatim wire shape.
  await panel.getByText("Raw event").click();
  await expect(panel).toContainText('"model_request_start_id"');

  await panel.getByRole("button", { name: "Close event details" }).click();
  await expect(panel).toBeHidden();

  // Debug renders every event verbatim — the span start included, which
  // the transcript hides in favor of the paired duration on the end row.
  await expect(
    page
      .getByTestId("event-row")
      .filter({ hasText: "span.model_request_start" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Debug" }).click();
  const startRow = page
    .getByTestId("debug-row")
    .filter({ hasText: "span.model_request_start" });
  await expect(startRow).toHaveCount(1);
  await expect(startRow).toContainText('"type": "span.model_request_start"');
});

/**
 * The one place the *rendered* number strings are asserted (CLAUDE.md's
 * `data-*` convention). Everything else in this suite reads raw values off
 * attributes, so changing `tokenCount` or `durationLabel` — a copy edit, a
 * separator, a unit — reddens this test alone instead of the trace suite.
 */
test("token and duration formatting", async ({ page }) => {
  await signIn(page);
  await page.goto(GATED);
  await expect(page.getByTestId("stream-state")).toHaveAttribute(
    "data-state",
    "live",
    { timeout: 15_000 },
  );

  await expect(page.getByTestId("usage-chip")).toHaveText(
    "5,412 in · 890 out · 3,100 cache read",
  );
  await expect(
    page
      .getByTestId("event-row")
      .filter({ hasText: "span.model_request_end" })
      .getByTitle("model request duration"),
  ).toHaveText("3s");
  await expect(
    page
      .getByTestId("event-row")
      .filter({ hasText: "session.status_idle" })
      .getByTitle("since session creation"),
  ).toHaveText("21:45:00");
});

test("an unknown event type renders its payload instead of a blank row", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/sessions/sesn_research0000000000001");
  const row = page
    .getByTestId("event-row")
    .filter({ hasText: "user.define_outcome" });
  await expect(row.getByTestId("unknown-event-payload")).toContainText(
    "Produce a comparative survey document.",
  );
});

test("the trace goes live over SSE and approving a tool call completes the turn", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(GATED);

  await expect(page.getByTestId("stream-state")).toHaveAttribute(
    "data-state",
    "live",
    { timeout: 15_000 },
  );
  await expect(page.getByTestId("approval-banner")).toBeVisible();

  await page.getByRole("button", { name: "Allow" }).click();

  // Confirmation, tool result, and the streamed reply all arrive over SSE.
  await expect(page.getByText("Dependencies installed.")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId("approval-banner")).toBeHidden();
  const confirmationRow = page
    .getByTestId("event-row")
    .filter({ hasText: "user.tool_confirmation" });
  await expect(confirmationRow).toHaveCount(1);
});

test("denying with a message lands as an error tool result", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(GATED);
  await expect(page.getByTestId("stream-state")).toHaveAttribute(
    "data-state",
    "live",
    { timeout: 15_000 },
  );
  await expect(page.getByTestId("approval-banner")).toBeVisible();

  await page.getByRole("button", { name: "Deny…" }).click();
  await page.getByPlaceholder("Reason (optional)").fill("Wrong directory");
  await page.getByRole("button", { name: "Deny", exact: true }).click();

  await expect(page.getByText("Understood — skipping that step.")).toBeVisible({
    timeout: 15_000,
  });
  const errorResult = page
    .getByTestId("event-row")
    .filter({ hasText: "agent.tool_result" })
    .filter({ hasText: "Wrong directory" });
  await expect(errorResult).toHaveCount(1);
});

test("the composer sends a message and the reply streams in", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(GATED);
  await expect(page.getByTestId("stream-state")).toHaveAttribute(
    "data-state",
    "live",
    { timeout: 15_000 },
  );
  // Clear the pending gate first so the session is idle.
  await page.getByRole("button", { name: "Allow" }).click();
  await expect(page.getByText("Dependencies installed.")).toBeVisible({
    timeout: 15_000,
  });

  await page
    .getByPlaceholder("Send a message to this session…")
    .fill("Now run the linter too.");
  await page.getByRole("button", { name: "Send" }).click();

  // Scope to event rows: the composer textarea also holds the typed text
  // until the send clears it, which strict mode would (rightly) flag.
  await expect(
    page.getByTestId("event-row").getByText("Now run the linter too."),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByTestId("event-row").getByText("Working on it now."),
  ).toBeVisible({ timeout: 15_000 });
});

test("interrupt while running lands a user.interrupt in the log", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(GATED);
  await expect(page.getByTestId("stream-state")).toHaveAttribute(
    "data-state",
    "live",
    { timeout: 15_000 },
  );
  await page.getByRole("button", { name: "Allow" }).click();
  await expect(page.getByText("Dependencies installed.")).toBeVisible({
    timeout: 15_000,
  });

  // Kick off a new turn; the Interrupt control appears once the session is
  // running (status arrives over SSE) and the mock streams slowly enough
  // to click it mid-turn.
  await page
    .getByPlaceholder("Send a message to this session…")
    .fill("Do something long.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page
    .getByRole("button", { name: "Interrupt", exact: true })
    .click({ timeout: 15_000 });

  await expect(
    page.getByTestId("event-row").filter({ hasText: "user.interrupt" }),
  ).toHaveCount(1, { timeout: 15_000 });
});
