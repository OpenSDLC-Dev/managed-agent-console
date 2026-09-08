import { expect, type APIResponse } from "@playwright/test";
import {
  MemorySchema,
  MemoryStoreSchema,
  MemoryVersionSchema,
} from "../../src/lib/platform/schemas";
import { test } from "./fixtures";

test("memory store lifecycle, optimistic writes and retained versions", async ({
  request,
}) => {
  const ok = async (response: APIResponse) => {
    expect(response.status(), `Unexpected status for ${response.url()}`).toBe(
      200,
    );
    return response.json();
  };
  const stamp = Date.now();
  let storeId: string | undefined;
  try {
    const store = MemoryStoreSchema.parse(
      await ok(
        await request.post("/v1/memory_stores", {
          data: {
            name: `console-contract-${stamp}`,
            description: "Model-free contract fixture",
            metadata: { phase: "created", remove: "yes" },
          },
        }),
      ),
    );
    storeId = store.id;

    const patched = MemoryStoreSchema.parse(
      await ok(
        await request.post(`/v1/memory_stores/${store.id}`, {
          data: { metadata: { phase: "updated", remove: null } },
        }),
      ),
    );
    expect(patched.metadata).toEqual({ phase: "updated" });

    const created = MemorySchema.parse(
      await ok(
        await request.post(`/v1/memory_stores/${store.id}/memories?view=full`, {
          data: { path: "/notes/brief.md", content: "First draft" },
        }),
      ),
    );
    expect(created.content).toBe("First draft");
    const firstVersionId = created.memory_version_id;

    const updated = MemorySchema.parse(
      await ok(
        await request.post(
          `/v1/memory_stores/${store.id}/memories/${created.id}?view=full`,
          {
            data: {
              content: "Final draft",
              precondition: {
                type: "content_sha256",
                content_sha256: created.content_sha256,
              },
            },
          },
        ),
      ),
    );
    expect(updated.content).toBe("Final draft");

    const stale = await request.post(
      `/v1/memory_stores/${store.id}/memories/${created.id}`,
      {
        data: {
          content: "Stale overwrite",
          precondition: {
            type: "content_sha256",
            content_sha256: created.content_sha256,
          },
        },
      },
    );
    expect(stale.status()).toBe(409);
    expect(await stale.json()).toMatchObject({
      type: "error",
      error: { type: "memory_precondition_failed_error" },
    });

    const tree = await ok(
      await request.get(
        `/v1/memory_stores/${store.id}/memories?path_prefix=/&depth=1`,
      ),
    );
    expect(tree.data).toContainEqual({
      type: "memory_prefix",
      path: "/notes/",
    });

    const redacted = MemoryVersionSchema.parse(
      await ok(
        await request.post(
          `/v1/memory_stores/${store.id}/memory_versions/${firstVersionId}/redact`,
          { data: {} },
        ),
      ),
    );
    expect(redacted).toMatchObject({
      path: null,
      content: null,
      content_size_bytes: null,
      content_sha256: null,
    });

    await ok(
      await request.delete(
        `/v1/memory_stores/${store.id}/memories/${created.id}?expected_content_sha256=${updated.content_sha256}`,
      ),
    );
    expect(
      (
        await request.get(
          `/v1/memory_stores/${store.id}/memories/${created.id}`,
        )
      ).status(),
    ).toBe(404);

    const versions = await ok(
      await request.get(
        `/v1/memory_stores/${store.id}/memory_versions?memory_id=${created.id}&view=full`,
      ),
    );
    const parsed = versions.data.map((row: unknown) =>
      MemoryVersionSchema.parse(row),
    );
    expect(
      parsed.map((version: { operation: string }) => version.operation),
    ).toEqual(expect.arrayContaining(["created", "modified", "deleted"]));

    const archived = MemoryStoreSchema.parse(
      await ok(
        await request.post(`/v1/memory_stores/${store.id}/archive`, {
          data: {},
        }),
      ),
    );
    expect(archived.archived_at).not.toBeNull();
    const refused = await request.post(
      `/v1/memory_stores/${store.id}/memories`,
      { data: { path: "/late.md", content: "Too late" } },
    );
    expect(refused.status()).toBe(400);

    await ok(await request.delete(`/v1/memory_stores/${store.id}`));
    storeId = undefined;
  } finally {
    if (storeId) await request.delete(`/v1/memory_stores/${storeId}`);
  }
});
