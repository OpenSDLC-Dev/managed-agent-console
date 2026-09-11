import { expect, type APIResponse } from "@playwright/test";
import { PlatformFileSchema } from "../../src/lib/platform/schemas";
import { test } from "./fixtures";

// files.go:fileJSON/listFiles at platform c75c5ad. Only this test's uploads
// are deleted, and no session events or model turns are needed.
test("file metadata and pagination survive deletion of the cursor row", async ({
  request,
}) => {
  const owned = new Set<string>();
  const ok = async (response: APIResponse) => {
    expect(response.status(), response.url()).toBe(200);
    return response.json();
  };
  try {
    for (let i = 0; i < 3; i++) {
      const body = await ok(
        await request.post("/v1/files", {
          multipart: {
            file: {
              name: `file-contract-${Date.now()}-${i}.txt`,
              mimeType: "text/plain",
              buffer: Buffer.from("cursor contract"),
            },
          },
        }),
      );
      // Register before parsing so a schema failure still cleans up the upload.
      owned.add(body.id);
      expect(PlatformFileSchema.parse(body).expires_at).toBeNull();
      expect(body).not.toHaveProperty("scope");
      const retrieved = await ok(await request.get(`/v1/files/${body.id}`));
      expect(PlatformFileSchema.parse(retrieved)).toEqual(
        PlatformFileSchema.parse(body),
      );
    }
    const first = await ok(await request.get("/v1/files?limit=1"));
    expect(first.data).toHaveLength(1);
    const boundary = first.data[0].id;
    expect(owned.has(boundary)).toBe(true);
    expect(first.next_page).toEqual(expect.any(String));
    const path = `/v1/files?limit=1&page=${encodeURIComponent(first.next_page)}`;
    const before = await ok(await request.get(path));
    expect(before.data).toHaveLength(1);
    expect(owned.has(before.data[0].id)).toBe(true);
    await ok(await request.delete(`/v1/files/${boundary}`));
    owned.delete(boundary);
    expect(await ok(await request.get(path))).toEqual(before);

    // An ids lookup of the deleted upload is empty and terminal.
    const terminal = await ok(await request.get(`/v1/files?ids[]=${boundary}`));
    expect(terminal.data).toEqual([]);
    expect(terminal.next_page).toBeNull();
  } finally {
    for (const id of owned) await ok(await request.delete(`/v1/files/${id}`));
  }
});
