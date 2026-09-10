import { expect } from "@playwright/test";
import { DreamSchema } from "../../src/lib/platform/schemas";
import { test } from "./fixtures";

// A successful create is intentionally absent: the real route queues a
// model-backed consolidation. Collection reads and pre-insert validation prove
// availability without spending a model turn or leaving durable test data.
test("dream collection and pre-insert validation", async ({ request }) => {
  const list = await request.get("/v1/dreams?limit=20");
  expect(list.status()).toBe(200);
  const page = await list.json();
  expect(Array.isArray(page.data)).toBe(true);
  for (const dream of page.data) DreamSchema.parse(dream);

  const invalid = await request.post("/v1/dreams", {
    data: { model: "claude-sonnet-4-8" },
  });
  expect(invalid.status()).toBe(400);
  await expect(invalid.json()).resolves.toMatchObject({
    type: "error",
    error: { type: "invalid_request_error" },
  });
});
