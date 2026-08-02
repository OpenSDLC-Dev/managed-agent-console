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

  await expect(page.getByText("Now run the linter too.")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Working on it now.")).toBeVisible({
    timeout: 15_000,
  });
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
