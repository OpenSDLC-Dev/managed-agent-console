import { expect, test } from "@playwright/test";
import { signIn } from "./sign-in";

const MOCK = "http://127.0.0.1:18080";

test.beforeEach(async ({ request }) => {
  await request.post(`${MOCK}/__reset`);
});

test("create, edit, archive and delete a memory store", async ({ page }) => {
  await signIn(page);
  await page.goto("/memory-stores/new");
  await page.getByLabel("Name").fill("Release notes");
  await page.getByLabel("Description").fill("Durable release context");
  await page
    .getByLabel("Metadata (JSON object)")
    .fill('{"owner":"console","remove":"me"}');
  await page.getByRole("button", { name: "Create memory store" }).click();

  await expect(page).toHaveURL(/\/memory-stores\/memstore_mock/);
  const storeId = page.url().split("/").at(-1)!;
  await expect(
    page.getByRole("heading", { name: "Release notes" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Description").fill("Updated context");
  await page.getByLabel("Metadata (JSON object)").fill('{"owner":"platform"}');
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText('"owner": "platform"')).toBeVisible();
  await expect(page.getByText(/remove/)).toHaveCount(0);

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await page.getByRole("button", { name: "Archive memory store" }).click();
  await expect(page.getByText("Archived · read only")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create memory" }),
  ).toBeHidden();

  await page.goto(`/memory-stores/${storeId}/edit`);
  await expect(
    page.getByText("Archived memory stores are read only."),
  ).toBeVisible();

  await page.goto(`/memory-stores/${storeId}`);
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete memory store" }).click();
  await expect(page).toHaveURL(/\/memory-stores$/);
});

test("memory writes keep history, enforce preconditions and redact old versions", async ({
  page,
  request,
}) => {
  await signIn(page);
  const storeId = "memstore_projectnotes000001";
  await page.goto(`/memory-stores/${storeId}/memories/new`);
  await page.getByLabel("Path").fill("/release/notes.md");
  await page.getByLabel("Content").fill("First draft");
  await page.getByRole("button", { name: "Create memory" }).click();
  await expect(page).toHaveURL(/\/memories\/mem_mock/);
  const memoryId = page.url().split("/").at(-1)!;
  await expect(page.getByTestId("memory-content")).toContainText("First draft");

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Content").fill("Final draft");
  await page.getByRole("button", { name: "Save memory" }).click();
  await expect(page.getByTestId("memory-content")).toContainText("Final draft");

  const conflict = await request.post(
    `${MOCK}/v1/memory_stores/${storeId}/memories/${memoryId}?view=full`,
    {
      headers: { "x-api-key": "test-key" },
      data: {
        content: "Stale overwrite",
        precondition: { type: "content_sha256", content_sha256: "stale" },
      },
    },
  );
  expect(conflict.status()).toBe(409);
  await expect(conflict.json()).resolves.toMatchObject({
    error: { type: "memory_precondition_failed_error" },
  });

  await page.goto(`/memory-stores/${storeId}/versions/memver_mock00000001`);
  await page.getByRole("button", { name: "Redact", exact: true }).click();
  await page.getByRole("button", { name: "Redact version" }).click();
  await expect(page.getByText("redacted", { exact: true })).toBeVisible();
  await expect(page.getByTestId("memory-version-content")).toContainText(
    "Redacted",
  );

  await page.goto(`/memory-stores/${storeId}/memories/${memoryId}`);
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete memory" }).click();
  await expect(page).toHaveURL(new RegExp(`/memory-stores/${storeId}$`));
  await expect(page.getByTestId("memory-version-list")).toContainText(
    "deleted",
  );
});
