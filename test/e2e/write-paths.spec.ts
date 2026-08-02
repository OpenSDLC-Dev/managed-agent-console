import { expect, test, type Page } from "@playwright/test";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.locator("form[data-hydrated]").waitFor();
  await page.getByLabel("Password").fill("test-password");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/agents$/);
}

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18080/__reset");
});

test("create, edit, archive, and delete an environment", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Environments", exact: true }).click();
  await page.getByRole("button", { name: "Create environment" }).click();

  await page.getByLabel("Name").fill("staging-sandbox");
  await page.getByLabel("Networking").click();
  await page.getByRole("option", { name: "limited" }).click();
  await page
    .getByLabel("Allowed hosts (one per line)")
    .fill("api.example.com\nregistry.npmjs.org");
  await page.getByLabel("npm", { exact: true }).fill("typescript, vitest");
  await page
    .getByRole("button", { name: "Create environment", exact: true })
    .click();

  await expect(page).toHaveURL(/\/environments\/env_mock/);
  await expect(
    page.getByText("limited — api.example.com, registry.npmjs.org"),
  ).toBeVisible();

  // Edit: rename and confirm the kind stays immutable.
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByText("cloud (immutable)")).toBeVisible();
  await page.getByLabel("Name").fill("staging-sandbox-2");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("heading", { name: "staging-sandbox-2" }),
  ).toBeVisible();

  // Archive, then delete (no sessions reference it).
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await page.getByRole("button", { name: "Archive environment" }).click();
  await expect(page.getByText("archived", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete environment" }).click();
  await expect(page).toHaveURL(/\/environments$/);
  await expect(page.getByText("staging-sandbox-2")).toBeHidden();
});

test("deleting an in-use environment surfaces the platform 400", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/environments/env_cloudlimited000000001");
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("button", { name: "Delete environment" }).click();
  await expect(page.getByText("environment still has sessions")).toBeVisible();
});

test("create a session with an uploaded file mount and drive it", async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole("link", { name: "Sessions", exact: true }).click();
  await page.getByRole("button", { name: "Create session" }).click();

  await page.getByLabel("Agent", { exact: true }).click();
  await page.getByRole("option", { name: /General task agent/ }).click();
  await page.getByLabel("Environment", { exact: true }).click();
  await page.getByRole("option", { name: /cloud-limited/ }).click();
  await page.getByLabel("Title (optional)").fill("Review the dataset");

  await page.getByLabel("Upload file").setInputFiles({
    name: "dataset.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("a,b\n1,2\n"),
  });
  await expect(page.getByText("dataset.csv")).toBeVisible();

  await page
    .getByRole("button", { name: "Create session", exact: true })
    .click();
  await expect(page).toHaveURL(/\/sessions\/sesn_mock/);
  await expect(
    page.getByRole("heading", { name: "Review the dataset" }),
  ).toBeVisible();
  // The file mount landed on the session.
  await expect(
    page.getByText(/\/mnt\/session\/uploads\/file_mock/),
  ).toBeVisible();

  // The new session is live end to end: send a message, get the reply.
  await expect(page.getByTestId("stream-state")).toHaveAttribute(
    "data-state",
    "live",
    { timeout: 15_000 },
  );
  await page
    .getByPlaceholder("Send a message to this session…")
    .fill("Summarize the dataset.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Working on it now.")).toBeVisible({
    timeout: 15_000,
  });
});
