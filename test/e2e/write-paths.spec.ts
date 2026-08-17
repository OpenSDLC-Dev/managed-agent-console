import { expect, test } from "@playwright/test";
import { signIn } from "./sign-in";

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18080/__reset");
});

test("create, edit, archive, and delete an environment", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Environments", exact: true }).click();
  await page.getByRole("button", { name: "Create environment" }).click();

  await page.getByLabel("Name").fill("staging-sandbox");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create environment", exact: true })
    .click();

  await expect(page).toHaveURL(/\/environments\/env_mock/);

  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByText("Cloud (immutable)")).toBeVisible();
  await page.getByLabel("Networking").click();
  await page.getByRole("option", { name: "limited" }).click();
  await page
    .getByLabel("Allowed hosts (one per line)")
    .fill("api.example.com\nregistry.npmjs.org");
  await page.getByLabel("npm", { exact: true }).fill("typescript, vitest");
  await page.getByLabel("Name").fill("staging-sandbox-2");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("heading", { name: "staging-sandbox-2" }),
  ).toBeVisible();

  // Archive, then delete (no sessions reference it).
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await page.getByRole("button", { name: "Archive environment" }).click();
  await expect(page.getByText("archived", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete environment" }).click();
  await expect(page).toHaveURL(/\/environments$/);
  await expect(page.getByText("staging-sandbox-2")).toBeHidden();
});

test("deleting an in-use environment surfaces the platform 400", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/environments/env_cloudlimited000000001");
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete environment" }).click();
  await expect(page.getByText("environment still has sessions")).toBeVisible();
});

test("create a session with an uploaded file mount and drive it", async ({
  page,
}) => {
  await signIn(page);
  await page.getByRole("link", { name: "Sessions", exact: true }).click();
  await page.getByRole("button", { name: "Create session" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

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
    .getByRole("dialog")
    .getByRole("button", { name: "Create session", exact: true })
    .click();
  await expect(page).toHaveURL(/\/sessions\/sesn_mock/);
  await expect(
    page.getByRole("heading", { name: "Review the dataset" }),
  ).toBeVisible();
  // The file mount landed on the session — the chip carries the mount path.
  const fileChip = page.getByTestId("session-chips").getByText("1 file");
  await expect(fileChip).toBeVisible();
  await expect(fileChip).toHaveAttribute(
    "title",
    /\/mnt\/session\/uploads\/file_mock/,
  );

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

test("vault lifecycle: create, add credentials, validate, archive", async ({
  page,
}) => {
  await signIn(page);
  await page
    .getByRole("link", { name: "Credential vaults", exact: true })
    .click();
  await page.getByRole("button", { name: "Create vault" }).click();
  await page.getByLabel("Display name").fill("CI secrets");
  await page.getByRole("button", { name: "Create vault", exact: true }).click();
  await expect(page).toHaveURL(/\/vaults\/vlt_mock/);

  // Env-var credential: the secret value leaves the form and never returns.
  await page.getByRole("button", { name: "Add credential" }).click();
  await page.getByLabel("Secret name").fill("NPM_TOKEN");
  await page.getByLabel("Secret value").fill("super-secret-value");
  await page
    .getByRole("button", { name: "Add credential", exact: true })
    .last()
    .click();
  await expect(page.getByText("NPM_TOKEN")).toBeVisible();
  await expect(page.getByText("super-secret-value")).toBeHidden();

  // OAuth credential + the validation probe.
  await page.getByRole("button", { name: "Add credential" }).first().click();
  await page.getByLabel("Credential type").click();
  await page.getByRole("option", { name: "mcp_oauth" }).click();
  await page.getByLabel("MCP server URL").fill("https://mcp.example.com/");
  await page.getByLabel("Access token").fill("oauth-token");
  await page
    .getByRole("button", { name: "Add credential", exact: true })
    .last()
    .click();
  await expect(page.getByText("https://mcp.example.com/")).toBeVisible();
  await page.getByRole("button", { name: "Validate" }).click();
  await expect(page.getByTestId("credential-notice")).toHaveText(
    /OAuth validation: ok/,
  );

  // Archive warns about the secret purge.
  await page
    .getByRole("main")
    .getByRole("button", { name: "More actions" })
    .click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await expect(
    page.getByText(/Archiving is terminal on the platform/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Archive vault" }).click();
  await expect(
    page.getByText("archived", { exact: true }).first(),
  ).toBeVisible();
});

test("skill upload, new version, and deletes", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Skills", exact: true }).click();
  await page.getByRole("button", { name: "Upload skill" }).click();
  await page.getByLabel("Display title (optional)").fill("Release notes");
  await page.getByLabel("Skill files").setInputFiles({
    name: "SKILL.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("---\nname: release-notes\n---\nWrite notes."),
  });
  await page
    .getByRole("button", { name: "Upload skill", exact: true })
    .last()
    .click();
  await expect(page).toHaveURL(/\/skills\/skill_mock/);
  await expect(
    page.getByRole("heading", { name: "Release notes" }),
  ).toBeVisible();
  await expect(page.getByTestId("event-row")).toHaveCount(0);

  // A second version lands on top.
  await page.getByLabel("New version files").setInputFiles({
    name: "SKILL.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("---\nname: release-notes\n---\nv2."),
  });
  await expect(
    page.getByRole("row").filter({ hasText: "Uploaded via console" }),
  ).toHaveCount(2);

  // Delete both versions (confirm dialog each), then the skill.
  for (let i = 0; i < 2; i++) {
    await page
      .getByRole("button", { name: /Delete version 17/ })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Delete version", exact: true })
      .click();
  }
  await expect(page.getByText("No versions")).toBeVisible();
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete skill" }).click();
  await expect(page).toHaveURL(/\/skills$/);
});

test("file upload and delete from the files page", async ({ page }) => {
  await signIn(page);
  await page.getByRole("link", { name: "Files", exact: true }).click();
  await page.getByLabel("Upload file").setInputFiles({
    name: "report.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 mock"),
  });
  await expect(
    page.getByRole("cell", { name: "report.pdf", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delete report.pdf" }).click();
  await expect(
    page.getByRole("cell", { name: "report.pdf", exact: true }),
  ).toBeHidden();
});

test("issue an environment key, see it once, then revoke it", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/environments/env_byoc0000000000000001");

  await page
    .getByRole("button", { name: "Generate environment key", exact: true })
    .click();
  await page.getByLabel("Name").fill("e2e-runner");
  await page
    .getByRole("button", { name: "Create environment key", exact: true })
    .click();

  // Shown exactly once, and only here. The mock mints `sk-map-env01-mock…`,
  // the platform's own prefix — deliberately not an Anthropic look-alike.
  const revealed = page.getByTestId("revealed-key");
  await expect(revealed).toBeVisible();
  const secret = ((await revealed.textContent()) ?? "").trim();
  expect(secret).toMatch(/^sk-map-env01-/);

  await page.getByTestId("close-revealed-key").click();
  await expect(page.getByTestId("revealed-key")).toBeHidden();

  // The issuance response carries no row, so a row appearing here is proof the
  // list was re-read rather than rendered from that response.
  const row = page.getByRole("row").filter({ hasText: "e2e-runner" });
  await expect(row.locator("[data-key-state]")).toHaveAttribute(
    "data-key-state",
    "active",
  );
  // Closing is final: the plaintext is nowhere in the document any more.
  expect(await page.content()).not.toContain(secret);

  await row.getByRole("button", { name: /^Revoke environment key / }).click();
  await page
    .getByRole("button", { name: "Revoke environment key", exact: true })
    .click();
  await expect(page.getByText("e2e-runner")).toBeHidden();
});

test("a cloud environment offers no keys and no setup guide", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/environments/env_cloudlimited000000001");
  await expect(page.getByTestId("environment-keys")).toHaveCount(0);
  await expect(page.getByTestId("environment-key-setup")).toHaveCount(0);
});
