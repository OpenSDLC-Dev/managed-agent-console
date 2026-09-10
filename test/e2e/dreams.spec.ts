import { expect, test } from "@playwright/test";
import { signIn } from "./sign-in";

const COMPLETED = "drm_completedresearch000001";

test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:18080/__reset");
});

test("lists dreams and renders inputs, outputs, usage and links", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/dreams");

  await expect(page.locator('[data-status="pending"]')).toBeVisible();
  await expect(page.locator('[data-status="completed"]')).toBeVisible();
  await page.locator(`[data-testid="id-cell"][data-id="${COMPLETED}"]`).click();

  await expect(page).toHaveURL(`/dreams/${COMPLETED}`);
  await expect(page.getByTestId("dream-inputs")).toHaveAttribute(
    "data-testid",
    "dream-inputs",
  );
  await expect(page.locator('[data-session-count="2"]')).toBeVisible();
  await expect(page.locator('[data-output-count="1"]')).toBeVisible();
  await expect(page.locator('[data-input-tokens="18400"]')).toHaveText(
    "18,400",
  );
  await expect(
    page.getByRole("link", { name: "memstore_projectnotes000001" }),
  ).toBeVisible();
  await expect(
    page
      .getByTestId("dream-inputs")
      .getByRole("link", { name: "sesn_gatedbash00000000001" }),
  ).toBeVisible();
});

test("creates, cancels and archives a pending dream", async ({ page }) => {
  await signIn(page);
  await page.goto("/dreams/new");
  await page.getByLabel("Memory store").fill("memstore_projectnotes000001");
  await page
    .getByLabel("Session IDs")
    .fill("sesn_research0000000000001\nsesn_gatedbash00000000001");
  await page.getByLabel("Model").fill("claude-sonnet-4-8");
  await page.getByLabel("Speed").click();
  await page.getByRole("option", { name: "Fast" }).click();
  await page.getByLabel("Instructions (optional)").fill("Keep durable facts.");
  await page.getByLabel("Output").click();
  await page.getByRole("option", { name: "Update the input store" }).click();
  await page.getByRole("button", { name: "Create dream" }).click();

  await expect(page).toHaveURL(/\/dreams\/drm_mock/);
  await expect(page.locator('[data-status="pending"]')).toBeVisible();
  await page.getByRole("button", { name: "Cancel dream" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel dream" })
    .click();
  await expect(page.locator('[data-status="canceled"]')).toBeVisible();

  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: "Archive" }).click();
  await page.getByRole("button", { name: "Archive dream" }).click();
  await expect(page.locator('[data-status="archived"]')).toBeVisible();
});

test("mock dream endpoints enforce the input and lifecycle contract", async ({
  request,
}) => {
  const headers = { "x-api-key": "test-key" };
  const base = {
    inputs: [
      { type: "memory_store", memory_store_id: "memstore_projectnotes000001" },
      { type: "sessions", session_ids: ["sesn_research0000000000001"] },
    ],
    model: "claude-sonnet-4-8",
    output_behavior: { type: "create_new" },
  };

  for (const data of [
    { ...base, inputs: [base.inputs[0]] },
    {
      ...base,
      inputs: [base.inputs[0], { type: "sessions", session_ids: [] }],
    },
    { ...base, instructions: "x".repeat(4097) },
    {
      ...base,
      output_behavior: {
        type: "update_existing",
        memory_store_id: "memstore_archivednotes0001",
      },
    },
  ]) {
    const response = await request.post("http://127.0.0.1:18080/v1/dreams", {
      headers,
      data,
    });
    expect(response.status()).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      type: "error",
      error: { type: "invalid_request_error" },
    });
  }

  const cancelCompleted = await request.post(
    `http://127.0.0.1:18080/v1/dreams/${COMPLETED}/cancel`,
    { headers },
  );
  expect(cancelCompleted.status()).toBe(400);
});
