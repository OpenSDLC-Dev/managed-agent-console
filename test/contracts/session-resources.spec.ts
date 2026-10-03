import { expect, type APIResponse } from "@playwright/test";
import {
  PlatformFileSchema,
  SessionResourceSchema,
  type PlatformFile,
} from "../../src/lib/platform/schemas";
import { test } from "./fixtures";

// No events are sent and no model is invoked. All test resources are removed.
test("session file resource add and removal", async ({ request }) => {
  const name = `resource-contract-${Date.now()}`;
  const ok = async (response: APIResponse) => {
    expect(response.status(), `Unexpected status for ${response.url()}`).toBe(
      200,
    );
    return response.json();
  };
  const agent = await ok(
    await request.post("/v1/agents", {
      data: { name, model: "claude-sonnet-4-8" },
    }),
  );
  let environmentId: string | undefined;
  let sessionId: string | undefined;
  let fileId: string | undefined;
  try {
    const environment = await ok(
      await request.post("/v1/environments", {
        data: { name, config: { type: "self_hosted" } },
      }),
    );
    environmentId = environment.id;
    const session = await ok(
      await request.post("/v1/sessions", {
        data: { agent: agent.id, environment_id: environmentId },
      }),
    );
    sessionId = session.id;
    const file = await ok(
      await request.post("/v1/files", {
        multipart: {
          file: {
            name: "note.txt",
            mimeType: "text/plain",
            buffer: Buffer.from("contract note"),
          },
        },
      }),
    );
    fileId = file.id;
    const resource = SessionResourceSchema.parse(
      await ok(
        await request.post(`/v1/sessions/${sessionId}/resources`, {
          data: { type: "file", file_id: fileId },
        }),
      ),
    );
    expect(resource.type).toBe("file");
    if (resource.type !== "file") throw new Error("Expected file resource");
    expect(resource.mount_path).toContain(fileId);

    // Platform #578: the mount names the session's own copy, never the upload.
    const copyId = resource.file_id;
    expect(copyId).not.toBe(fileId);
    const scoped = async () =>
      (
        await ok(
          await request.get(`/v1/files?scope_id=${sessionId}&limit=1000`),
        )
      ).data.map((row: unknown) => PlatformFileSchema.parse(row));
    const copy = (await scoped()).find(
      (row: PlatformFile) => row.id === copyId,
    );
    expect(copy).toMatchObject({
      filename: "note.txt",
      mime_type: file.mime_type,
      size_bytes: file.size_bytes,
      downloadable: false,
      scope: { id: sessionId, type: "session" },
    });
    expect(
      PlatformFileSchema.parse(
        await ok(await request.get(`/v1/files/${copyId}`)),
      ).downloadable,
    ).toBe(false);
    // The unfiltered list carries the upload and no session-scoped row.
    const unfiltered = (await ok(await request.get("/v1/files?limit=1000")))
      .data as PlatformFile[];
    expect(unfiltered.map((row) => row.id)).toContain(fileId);
    expect(unfiltered.map((row) => row.id)).not.toContain(copyId);
    expect(unfiltered.filter((row) => row.scope)).toEqual([]);

    await ok(
      await request.delete(
        `/v1/sessions/${sessionId}/resources/${resource.id}`,
      ),
    );
    // Removing the reference keeps the copy, still the session's own file.
    expect((await scoped()).map((row: PlatformFile) => row.id)).toContain(
      copyId,
    );
    expect(
      (
        await request.get(`/v1/sessions/${sessionId}/resources/${resource.id}`)
      ).status(),
    ).toBe(404);
  } finally {
    try {
      if (sessionId)
        await ok(await request.delete(`/v1/sessions/${sessionId}`));
    } finally {
      try {
        if (fileId) await ok(await request.delete(`/v1/files/${fileId}`));
      } finally {
        try {
          if (environmentId)
            await ok(await request.delete(`/v1/environments/${environmentId}`));
        } finally {
          await ok(
            await request.post(`/v1/agents/${agent.id}/archive`, { data: {} }),
          );
        }
      }
    }
  }
});
