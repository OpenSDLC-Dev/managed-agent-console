import { expect, test } from "@playwright/test";
import { signIn } from "./sign-in";

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18080/__reset");
});

test("attach a file to an existing session and remove its reference", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/sessions/sesn_gatedbash00000000001");
  await page.getByRole("button", { name: "Attach file" }).click();
  await page
    .getByLabel("File ID", { exact: true })
    .fill("file_notes0000000000001");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Attach file" })
    .click();
  await expect(
    page.getByText("file_notes0000000000001", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-resource-count]")).toHaveAttribute(
    "data-resource-count",
    "1",
  );
  await page.getByRole("button", { name: /^Remove resource / }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove resource", exact: true })
    .click();
  await expect(page.getByText("No resources attached.")).toBeVisible();
  const files = await (await page.request.get("/api/platform/v1/files")).json();
  expect(
    files.data.some(
      (file: { id: string }) => file.id === "file_notes0000000000001",
    ),
  ).toBe(true);
});

test("repository tokens stay write-only and memory references can be removed", async ({
  page,
}) => {
  await signIn(page);
  const created = await page.request.post("/api/platform/v1/sessions", {
    data: {
      agent: "agent_taskrunner0000000001",
      environment_id: "env_cloudlimited000000001",
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
  await page.goto(`/sessions/${session.id}`);
  await expect(page.getByText("Project notes", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Rotate token" }).click();
  await page.getByLabel("Authorization token").fill("test-only-rotated");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Rotate token" })
    .click();
  await expect(page.getByRole("dialog")).toBeHidden();
  const refreshed = await (
    await page.request.get(`/api/platform/v1/sessions/${session.id}`)
  ).json();
  expect(JSON.stringify(refreshed)).not.toContain("test-only-rotated");
  await page
    .getByRole("button", {
      name: "Remove resource memstore_projectnotes000001",
    })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Remove resource", exact: true })
    .click();
  await expect(page.getByText("Project notes", { exact: true })).toBeHidden();
  await expect(
    page.getByRole("button", { name: /^Remove resource / }),
  ).toBeHidden();
});
