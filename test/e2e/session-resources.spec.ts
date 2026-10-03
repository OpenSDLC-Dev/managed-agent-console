import { expect, test } from "@playwright/test";
import { signIn } from "./sign-in";

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18080/__reset");
});

test("attach a file to an existing session and remove its reference", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/sessions/sesn_gatedbash00000000001?inspector=resources");
  await page.getByRole("button", { name: "Attach file" }).click();
  await page
    .getByLabel("File ID", { exact: true })
    .fill("file_notes0000000000001");
  const added = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().endsWith("/sessions/sesn_gatedbash00000000001/resources"),
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Attach file" })
    .click();
  // The mount names the session's own copy (platform #578), and its default
  // path still names the upload.
  const { file_id: copy } = (await (await added).json()) as {
    file_id: string;
  };
  expect(copy).not.toBe("file_notes0000000000001");
  await expect(page.getByText(copy, { exact: true })).toBeVisible();
  await expect(
    page.getByText("/mnt/session/uploads/file_notes0000000000001"),
  ).toBeVisible();
  await expect(page.locator("[data-resource-count]")).toHaveAttribute(
    "data-resource-count",
    "1",
  );
  const panel = page.getByTestId("session-resources");
  await expect(panel).toHaveAttribute("data-session-file-count", "1");
  await expect(panel.locator('[data-size-bytes="48213"]')).toBeVisible();
  await page.getByRole("button", { name: /^Remove resource / }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove resource", exact: true })
    .click();
  // The header's resource chip goes with the last resource.
  await expect(page.locator("[data-resource-count]")).toHaveCount(0);
  // Removing the reference leaves the copy, still the session's own file and
  // a row of the tab, so the tab is not empty.
  const leftover = panel.locator(`[data-session-file-id="${copy}"]`);
  await expect(leftover).toHaveAttribute("data-downloadable", "false");
  await expect(leftover).toContainText("research-notes.md");
  await expect(leftover.getByRole("link")).toHaveCount(0);
  await expect(panel).toHaveAttribute("data-resources-state", "rows");
  const files = await (await page.request.get("/api/platform/v1/files")).json();
  expect(files.data.map((file: { id: string }) => file.id)).toContain(
    "file_notes0000000000001",
  );
  expect(files.data.map((file: { id: string }) => file.id)).not.toContain(copy);

  // Deleting the copy empties the tab and keeps the upload it was copied from.
  await leftover
    .getByRole("button", { name: `Delete research-notes.md (${copy})` })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete file", exact: true })
    .click();
  await expect(panel).toHaveAttribute("data-session-file-count", "0");
  await expect(panel).toHaveAttribute("data-resources-state", "empty");
  expect(
    (await page.request.get(`/api/platform/v1/files/${copy}`)).status(),
  ).toBe(404);
  expect(
    (
      await page.request.get("/api/platform/v1/files/file_notes0000000000001")
    ).status(),
  ).toBe(200);
});

test("repository tokens stay write-only and a memory store offers no Remove", async ({
  page,
}) => {
  await signIn(page);
  const created = await page.request.post("/api/platform/v1/sessions", {
    data: {
      agent: "agent_taskrunner0000000001",
      environment_id: "env_egress000000000000001",
      resources: [
        {
          type: "github_repository",
          url: "https://github.com/example/project",
          authorization_token: "test-only-original",
        },
        {
          type: "memory_store",
          memory_store_id: "memstore_projectnotes000001",
          access: "read_only",
        },
      ],
    },
  });
  expect(created.status()).toBe(200);
  const session = await created.json();
  expect(JSON.stringify(session)).not.toContain("test-only-original");
  await page.goto(`/sessions/${session.id}?inspector=resources`);
  await expect(page.getByText("Project notes", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Rotate token" }).click();
  await page.getByLabel("Authorization token").fill("test-only-rotated");
  const rotatedResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes(`/sessions/${session.id}/resources/`),
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Rotate token" })
    .click();
  const rotated = await rotatedResponse;
  expect(await rotated.text()).not.toContain("test-only-rotated");
  await expect(page.getByRole("dialog")).toBeHidden();
  const refreshed = await (
    await page.request.get(`/api/platform/v1/sessions/${session.id}`)
  ).json();
  expect(JSON.stringify(refreshed)).not.toContain("test-only-rotated");
  // Neither row offers Remove: the platform keeps a repository for the
  // session's lifetime, and answers a memory store's id 404, a memory element
  // carrying no sesrsc_ id (#193). The store's row keeps its own controls.
  await expect(
    page.getByRole("button", { name: "Expand /mnt/memory/project-notes" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Remove resource / }),
  ).toHaveCount(0);
});
