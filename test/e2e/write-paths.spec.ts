import { expect, test } from "@playwright/test";
import { signIn } from "./sign-in";

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18080/__reset");
});

test("mock vault updates reject malformed or invalid requests atomically", async ({
  request,
}) => {
  const base = "http://127.0.0.1:18080/v1";
  const headers = { "x-api-key": "test-key" };
  const vault = await (
    await request.post(`${base}/vaults`, {
      headers,
      data: { display_name: "Atomic updates", metadata: { state: "original" } },
    })
  ).json();
  const credential = await (
    await request.post(`${base}/vaults/${vault.id}/credentials`, {
      headers,
      data: {
        display_name: "Original credential",
        metadata: { state: "original" },
        auth: {
          type: "environment_variable",
          secret_name: "ATOMIC_TOKEN",
          secret_value: "write-only",
        },
      },
    })
  ).json();

  for (const path of [
    `${base}/vaults/${vault.id}`,
    `${base}/vaults/${vault.id}/credentials/${credential.id}`,
  ]) {
    const response = await request.post(path, {
      headers: { ...headers, "content-type": "application/json" },
      data: Buffer.from("{"),
    });
    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { type: "invalid_request_error" },
    });
  }

  const invalid = await request.post(
    `${base}/vaults/${vault.id}/credentials/${credential.id}`,
    {
      headers,
      data: {
        display_name: "Partially changed",
        metadata: { state: "changed" },
        auth: { type: "static_bearer" },
      },
    },
  );
  expect(invalid.status()).toBe(400);

  const unchanged = await (
    await request.get(
      `${base}/vaults/${vault.id}/credentials/${credential.id}`,
      { headers },
    )
  ).json();
  expect(unchanged).toMatchObject({
    display_name: "Original credential",
    metadata: { state: "original" },
    auth: { type: "environment_variable" },
  });
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
  await expect(
    page.getByRole("combobox", { name: "Environment type" }),
  ).toHaveCount(0);
  await page.getByLabel("Networking").click();
  await page.getByRole("option", { name: "Limited" }).click();
  await page
    .getByLabel("Allowed hosts (one per line)")
    .fill("api.example.com\nregistry.npmjs.org");
  await page.getByLabel("Package manager 1").selectOption("npm");
  await page.getByLabel("Package 1", { exact: true }).fill("typescript");
  await page.getByRole("button", { name: "Add package", exact: true }).click();
  await page.getByLabel("Package manager 2").selectOption("npm");
  await page.getByLabel("Package 2", { exact: true }).fill("vitest");
  await page.getByLabel("Name").fill("staging-sandbox-2");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("heading", { name: "staging-sandbox-2" }),
  ).toBeVisible();

  // Archive, then delete (no sessions reference it).
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await page.getByRole("button", { name: "Archive environment" }).click();
  await expect(page.locator('[data-status="archived"]')).toBeVisible();
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

test("create a session with file and memory mounts, then drive it", async ({
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
  await page.getByRole("button", { name: "Resource", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Memory store", exact: true })
    .click();
  await expect(
    page.locator('[data-memory-store-options-state="ready"]'),
  ).toBeVisible();
  await page.getByLabel("Memory store ID").fill("memstore_projectnotes000001");

  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Create session", exact: true })
    .click();
  await expect(page).toHaveURL(/\/sessions\/sesn_mock/);
  await expect(
    page.getByRole("heading", { name: "Review the dataset" }),
  ).toBeVisible();
  // The file mount landed on the session — the chip carries the mount path.
  const fileChip = page
    .getByTestId("session-chips")
    .locator('[data-resource-count="2"]');
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

test("the first credential returns to the populated vault after creation", async ({
  page,
}) => {
  await signIn(page);
  await page
    .getByRole("link", { name: "Credential vaults", exact: true })
    .click();
  await page.getByRole("button", { name: "Create vault" }).click();
  await page.getByLabel("Display name").fill("First credential vault");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add a credential" });
  await expect(
    dialog.getByLabel("Credential type").locator('[data-slot="select-value"]'),
  ).toHaveText("MCP OAuth");
  await dialog.getByLabel("Credential type").click();
  await page
    .getByRole("option", { name: "Environment variable", exact: true })
    .click();
  await dialog.getByLabel("Name (optional)").fill("First credential");
  await dialog.getByLabel("Secret name").fill("CI_TOKEN");
  await dialog.getByLabel("Secret value").fill("synthetic-first-secret");
  await dialog.getByRole("radio", { name: "Unrestricted" }).check();
  await dialog
    .getByRole("button", { name: "Add credential", exact: true })
    .click();
  await expect(page).toHaveURL(/\/vaults\/vlt_mock[^/]+$/);
  await expect(
    page.getByRole("heading", { name: "First credential vault", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "First credential" }),
  ).toBeVisible();
  await expect(page.getByText("synthetic-first-secret")).toBeHidden();
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
  await page.getByText("Metadata (optional)", { exact: true }).click();
  await page.getByLabel("Metadata (JSON object)").fill('{"team":"ci"}');
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(page).toHaveURL(/\/vaults\/vlt_mock/);

  // Vault updates preserve platform patch semantics.
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Display name").fill("CI credentials");
  await page.getByLabel("Metadata (JSON object)").fill('{"owner":"e2e"}');
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("heading", { name: "CI credentials" }),
  ).toBeVisible();

  // Env-var credential: the secret value leaves the form and never returns.
  await page.getByRole("button", { name: "Add credential" }).click();
  await page.getByRole("radio", { name: "Unrestricted" }).check();
  await page.getByLabel("Secret name").fill("NPM_TOKEN");
  await page.getByLabel("Secret value").fill("super-secret-value");
  await page
    .getByRole("button", { name: "Add credential", exact: true })
    .last()
    .click();
  await expect(page.getByText("NPM_TOKEN")).toBeVisible();
  await expect(page.getByText("super-secret-value")).toBeHidden();

  // The credential has its own secret-free detail and edit lifecycle.
  await page.getByText("NPM_TOKEN").click();
  await expect(page).toHaveURL(/\/credentials\/vcred_mock/);
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Display name (optional)").fill("npm publishing");
  await page.getByLabel("Replacement secret value").fill("rotated-secret");
  await page.getByLabel("Body").check();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("heading", { name: "npm publishing" }),
  ).toBeVisible();
  await expect(page.getByText("rotated-secret")).toBeHidden();
  await page.getByRole("button", { name: /Actions for vcred_mock/ }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await page.getByRole("button", { name: "Archive credential" }).click();
  await expect(page.getByText("archived", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "CI credentials" }).click();
  await page.getByLabel("Show archived").check();
  const archivedCredential = page
    .getByRole("row")
    .filter({ hasText: "npm publishing" });
  await expect(archivedCredential).toBeVisible();
  await expect(
    archivedCredential.getByText("archived", { exact: true }),
  ).toBeVisible();

  // OAuth credential + the validation probe.
  await page.getByRole("button", { name: "Add credential" }).first().click();
  await page.getByLabel("Credential type").click();
  await page.getByRole("option", { name: "MCP OAuth" }).click();
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

  // Archive warns about the remaining secret purge.
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
  await page.getByLabel("Display name (optional)").fill("Release notes");
  await page.getByLabel("ZIP archive").setInputFiles({
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

  // Delete one version, then cascade-delete the skill and its last version.
  {
    await page
      .getByRole("button", { name: /^Delete version / })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Delete version", exact: true })
      .click();
  }
  await expect(
    page.getByRole("button", { name: /Delete version skver_/ }),
  ).toHaveCount(1);
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
