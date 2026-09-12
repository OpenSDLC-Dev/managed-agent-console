import { expect, test } from "@playwright/test";
import { signIn } from "./sign-in";

const GATED = "/sessions/sesn_gatedbash00000000001";

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
  await page.getByRole("button", { name: "Approve" }).click();
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

test("outcome evaluations and their trace events have dedicated rendering", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/sessions/sesn_research0000000000001");
  const outcomes = page.getByTestId("session-outcomes");
  await expect(outcomes).toHaveAttribute("data-outcome-count", "1");
  await expect(outcomes).toHaveAttribute("data-active-outcome", "false");
  const evaluation = page.getByTestId("outcome-evaluation");
  await expect(evaluation).toHaveAttribute("data-outcome-result", "satisfied");
  await expect(evaluation).toHaveAttribute("data-outcome-iteration", "0");
  await expect(evaluation).toContainText(
    "The survey compares six frameworks and cites each primary source.",
  );

  await page.getByRole("button", { name: "Outcomes", exact: true }).click();
  const rows = page.getByTestId("event-row");
  await expect(page.getByTestId("events-toolbar")).toHaveAttribute(
    "data-visible-events",
    "4",
  );
  const definition = rows.filter({ hasText: "user.define_outcome" });
  await expect(definition).toContainText(
    "Produce a comparative survey document.",
  );
  await expect(definition.getByTestId("unknown-event-payload")).toHaveCount(0);
  const end = rows.filter({ hasText: "span.outcome_evaluation_end" });
  await expect(end).toHaveAttribute("data-input-tokens", "1200");
  await expect(end).toContainText("Satisfied · Iteration 1");
});

test("defines an outcome on an idle session", async ({ page }) => {
  await signIn(page);
  await page.goto(GATED);
  await expect(page.getByTestId("session-outcomes")).toHaveAttribute(
    "data-active-outcome",
    "false",
  );

  await page.getByRole("button", { name: "Define outcome" }).click();
  const dialog = page.getByRole("dialog", { name: "Define outcome" });
  await dialog.getByLabel("Description").fill("Ship a tested patch");
  await dialog
    .getByLabel("Rubric", { exact: true })
    .fill("Lint and tests pass.");
  await dialog.getByLabel("Maximum iterations").fill("4");
  await dialog.getByRole("button", { name: "Define outcome" }).click();

  await expect(page.getByTestId("session-outcomes")).toHaveAttribute(
    "data-active-outcome",
    "true",
  );
  const evaluation = page.getByTestId("outcome-evaluation");
  await expect(evaluation).toHaveAttribute("data-outcome-result", "pending");
  await expect(evaluation).toContainText("Ship a tested patch");
  await expect(
    page
      .getByTestId("event-row")
      .filter({ hasText: "user.define_outcome" })
      .filter({ hasText: "Ship a tested patch" }),
  ).toHaveCount(1);
});

test("file rubric size limit counts content bytes", async ({ page }) => {
  await signIn(page);
  const upload = async (name: string, size: number) => {
    const response = await page.request.post("/api/platform/v1/files", {
      multipart: {
        file: {
          name,
          mimeType: "text/plain",
          buffer: Buffer.alloc(size, "x"),
        },
      },
    });
    expect(response.ok()).toBe(true);
    return (await response.json()) as { id: string; size_bytes: number };
  };

  const acceptedFile = await upload("rubric-256k.txt", 256 * 1024);
  expect(acceptedFile.size_bytes).toBe(256 * 1024);
  const accepted = await page.request.post(
    `/api/platform/v1/sessions/${GATED.slice("/sessions/".length)}/events`,
    {
      data: {
        events: [
          {
            type: "user.define_outcome",
            description: "Accept the boundary file",
            rubric: { type: "file", file_id: acceptedFile.id },
          },
        ],
      },
    },
  );
  expect(accepted.status()).toBe(200);

  const rejectedFile = await upload("rubric-over-256k.txt", 256 * 1024 + 1);
  expect(rejectedFile.size_bytes).toBe(256 * 1024 + 1);
  const rejected = await page.request.post(
    `/api/platform/v1/sessions/${GATED.slice("/sessions/".length)}/events`,
    {
      data: {
        events: [
          {
            type: "user.define_outcome",
            description: "Reject the oversized file",
            rubric: { type: "file", file_id: rejectedFile.id },
          },
        ],
      },
    },
  );
  expect(rejected.status()).toBe(400);
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

  await page.getByRole("button", { name: "Approve" }).click();

  // Confirmation, tool result, and the streamed reply all arrive over SSE.
  await expect(page.getByText("Dependencies installed.")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId("approval-banner")).toBeHidden();
  await expect(page.getByText("needs approval", { exact: true })).toHaveCount(
    0,
  );
  const confirmationRow = page
    .getByTestId("event-row")
    .filter({ hasText: "user.tool_confirmation" });
  await expect(confirmationRow).toHaveCount(1);
});

test("Deny submits immediately without opening a reason form", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(GATED);
  await expect(page.getByTestId("approval-banner")).toBeVisible();
  const posted = page.waitForRequest(
    (request) =>
      request.method() === "POST" && request.url().endsWith("/events"),
  );
  await page.getByRole("button", { name: "Deny", exact: true }).click();
  const request = await posted;
  expect(request.postDataJSON().events).toEqual([
    expect.objectContaining({ type: "user.tool_confirmation", result: "deny" }),
  ]);
  expect(request.postDataJSON().events[0]).not.toHaveProperty("deny_message");
  await expect(page.getByLabel("Deny reason")).toHaveCount(0);
  await expect(page.getByTestId("approval-banner")).toBeHidden();
  await expect(page.getByText("needs approval", { exact: true })).toHaveCount(
    0,
  );
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

  await page.getByRole("button", { name: "Approval options" }).click();
  await page.getByRole("menuitem", { name: "Deny with reason…" }).click();
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
  await page.getByRole("button", { name: "Approve" }).click();
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
  await page.getByRole("button", { name: "Approve" }).click();
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
