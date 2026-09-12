import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { signIn } from "./sign-in";
const AGENT = "agent_researcher00000000001";
test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18080/__reset");
});

test("inline configuration discards, saves a new version and opens read-only history", async ({
  page,
}) => {
  await signIn(page, "/agents/" + AGENT);
  const description = page.getByLabel("Description", { exact: true });
  await expect(description).toHaveValue(
    "Multi-step web research with citations.",
  );
  await expect(
    page.getByRole("button", { name: "Save new version" }),
  ).toBeHidden();
  await description.fill("Draft to discard");
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await expect(description).toHaveValue(
    "Multi-step web research with citations.",
  );
  await description.fill("Saved inline");
  const save = page.waitForRequest(
    (req) =>
      req.method() === "POST" && req.url().endsWith("/v1/agents/" + AGENT),
  );
  await page.getByRole("button", { name: "Save new version" }).click();
  expect((await save).postDataJSON()).toMatchObject({
    version: 3,
    description: "Saved inline",
  });
  await expect(
    page.getByRole("button", { name: "Save new version" }),
  ).toBeHidden();
  await expect(
    page.getByRole("combobox", { name: "Agent version" }),
  ).toContainText("Version: 4");
  await expect(description).toHaveValue("Saved inline");
  await page.getByRole("combobox", { name: "Agent version" }).click();
  await page.getByRole("option", { name: /^v3 · Created/ }).click();
  await expect(page).toHaveURL(/version=3/);
  await expect(description).toBeDisabled();
  await expect(description).toHaveValue(
    "Multi-step web research with citations.",
  );
  await page.getByRole("radio", { name: "raw" }).click();
  await expect(page.getByLabel("Raw agent config")).toHaveAttribute(
    "readonly",
    "",
  );
  await page.reload();
  await expect(description).toBeDisabled();
  await page.getByRole("combobox", { name: "Agent version" }).click();
  await page.getByRole("option", { name: "v4 Latest" }).click();
  await expect(description).toBeEnabled();
  await expect(description).toHaveValue("Saved inline");
});

test("version and section navigation protect drafts and related lists use the agent filter", async ({
  page,
}) => {
  await signIn(page, "/agents/" + AGENT);
  const description = page.getByLabel("Description", { exact: true });
  await description.fill("Unsaved");
  await page.getByRole("combobox", { name: "Agent version" }).click();
  await page.getByRole("option", { name: /^v2 · Created/ }).click();
  const prompt = page.getByRole("dialog", { name: "Unsaved changes" });
  await prompt.getByRole("button", { name: "Stay" }).click();
  await expect(description).toHaveValue("Unsaved");
  await expect(page).not.toHaveURL(/version=/);
  await page.getByRole("button", { name: "sessions", exact: true }).click();
  await prompt.getByRole("button", { name: "Leave" }).click();
  await expect(
    page.getByRole("region", { name: "Agent sessions" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/tab=sessions/);
  await page.getByRole("combobox", { name: "Agent version" }).click();
  const request = page.waitForRequest(
    (req) =>
      req.url().includes("/v1/sessions?") &&
      req.url().includes("agent_version=2"),
  );
  await page.getByRole("option", { name: /^v2 · Created/ }).click();
  expect(new URL((await request).url()).searchParams.get("agent_id")).toBe(
    AGENT,
  );
  await expect(page.getByText("No sessions", { exact: true })).toBeVisible();
  const deployment = page.waitForRequest(
    (req) =>
      req.url().includes("/v1/deployments?") &&
      req.url().includes("agent_id=" + AGENT),
  );
  await page.getByRole("button", { name: "deployments", exact: true }).click();
  await deployment;
  await expect(
    page.getByRole("region", { name: "Agent deployments" }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("region", { name: "Agent sessions" }),
  ).toBeVisible();
});

test("two inline editors retain the stale draft until the operator reloads the latest version", async ({
  context,
  page,
}) => {
  await signIn(page, "/agents/" + AGENT);
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
    "Deep researcher",
  );
  const other = await context.newPage();
  await other.goto("/agents/" + AGENT);
  await expect(other.getByLabel("Name", { exact: true })).toHaveValue(
    "Deep researcher",
  );
  await page
    .getByLabel("Description", { exact: true })
    .fill("Remote saved value");
  await page.getByRole("button", { name: "Save new version" }).click();
  await expect(
    page.getByRole("combobox", { name: "Agent version" }),
  ).toContainText("Version: 4");
  await other.getByLabel("Description", { exact: true }).fill("Stale draft");
  await other.getByRole("button", { name: "Save new version" }).click();
  await expect(other.getByText(/Someone else updated/)).toBeVisible();
  await expect(other.getByLabel("Description", { exact: true })).toHaveValue(
    "Stale draft",
  );
  await other
    .getByRole("button", { name: "Reload the latest version" })
    .click();
  await other
    .getByRole("dialog", { name: "Unsaved changes" })
    .getByRole("button", { name: "Leave" })
    .click();
  await expect(other.getByLabel("Description", { exact: true })).toHaveValue(
    "Remote saved value",
  );
  await expect(
    other.getByRole("button", { name: "Save new version" }),
  ).toBeHidden();
});

test("Start session pins the selected version and navigation remains guarded", async ({
  page,
}) => {
  await signIn(page, "/agents/" + AGENT + "?version=2");
  await expect(page.getByLabel("Name", { exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Start session" }).click();
  const dialog = page.getByRole("dialog", { name: "Create session" });
  await expect(page).toHaveURL(
    /agents\/agent_researcher00000000001\?version=2/,
  );
  await expect(dialog.locator("[data-session-agent-version]")).toHaveAttribute(
    "data-session-agent-version",
    "2",
  );
  await page
    .getByRole("combobox", { name: "Environment", exact: true })
    .click();
  await page.getByRole("option").first().click();
  const request = page.waitForRequest(
    (req) => req.method() === "POST" && req.url().endsWith("/v1/sessions"),
  );
  await page
    .getByRole("button", { name: "Create session", exact: true })
    .click();
  expect((await request).postDataJSON().agent).toEqual({
    type: "agent",
    id: AGENT,
    version: 2,
  });
  await expect(page).toHaveURL(/sessions\/sesn_mock/);
});

test("narrow editing keeps the draft actions reachable and exposes invalid historical versions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "/agents/" + AGENT);
  await page.getByLabel("Description", { exact: true }).fill("Narrow draft");
  await expect(
    page.getByRole("button", { name: "Discard", exact: true }),
  ).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "Save new version" }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Discard", exact: true }).click();
  await page.goto("/agents/" + AGENT + "?version=bad");
  await expect(page.getByTestId("error-state")).toHaveAttribute(
    "data-error-status",
    "400",
  );
  await expect(
    page.getByRole("combobox", { name: "Agent version" }),
  ).toBeVisible();
});

test("Start session cancellation retains the Agent draft and creation confirms leaving it", async ({
  page,
}) => {
  await signIn(page, "/agents/" + AGENT);
  const description = page.getByLabel("Description", { exact: true });
  await description.fill("Preserved agent draft");
  await page
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Create session" });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(description).toHaveValue("Preserved agent draft");
  await page
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  await dialog
    .getByRole("combobox", { name: "Environment", exact: true })
    .click();
  await page.getByRole("option").first().click();
  let posts = 0;
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().endsWith("/v1/sessions")) posts++;
  });
  await dialog
    .getByRole("button", { name: "Create session", exact: true })
    .click();
  const prompt = page.getByRole("dialog", {
    name: "Unsaved changes",
    exact: true,
  });
  await prompt.getByRole("button", { name: "Stay" }).click();
  expect(posts).toBe(0);
  await dialog
    .getByRole("button", { name: "Create session", exact: true })
    .click();
  await prompt.getByRole("button", { name: "Leave" }).click();
  await expect(page).toHaveURL(/sessions\/sesn_mock/);
  expect(posts).toBe(1);
});

test("failed session creation keeps the Agent draft and its navigation protection", async ({
  page,
}) => {
  await signIn(page, "/agents/" + AGENT);
  await page
    .getByLabel("Description", { exact: true })
    .fill("Draft survives failure");
  await page
    .getByRole("button", { name: "Start session", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Create session" });
  await dialog
    .getByRole("combobox", { name: "Environment", exact: true })
    .click();
  await page.getByRole("option").first().click();
  await page.route("**/api/platform/v1/sessions", async (route) => {
    if (route.request().method() === "POST")
      await route.fulfill({
        status: 500,
        json: {
          error: { type: "api_error", message: "Session creation unavailable" },
        },
      });
    else await route.continue();
  });
  await dialog
    .getByRole("button", { name: "Create session", exact: true })
    .click();
  const prompt = page.getByRole("dialog", {
    name: "Unsaved changes",
    exact: true,
  });
  await prompt.getByRole("button", { name: "Leave" }).click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Session creation unavailable",
  );
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Description", { exact: true })).toHaveValue(
    "Draft survives failure",
  );
  await page.getByRole("button", { name: "sessions", exact: true }).click();
  await prompt.getByRole("button", { name: "Stay" }).click();
  await expect(page.getByLabel("Description", { exact: true })).toHaveValue(
    "Draft survives failure",
  );
});
