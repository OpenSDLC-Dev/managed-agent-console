import { expect, test, type APIResponse } from "@playwright/test";
import {
  SkillSchema,
  SkillVersionSchema,
} from "../../src/lib/platform/schemas";

// No model requests or sessions. Only resources created by this test are removed.
test("GA Skills: upload, read, page, download, protect last version and cascade delete", async ({
  request,
}) => {
  const name = `contract-${Date.now()}`;
  const bundle = {
    name: `${name}/SKILL.md`,
    mimeType: "text/markdown",
    buffer: Buffer.from(
      `---\nname: ${name}\ndescription: Local contract fixture\n---\nReturn the word verified.\n`,
    ),
  };
  const ok = async (response: APIResponse) => {
    expect(response.status(), `Unexpected status for ${response.url()}`).toBe(
      200,
    );
    return response.json();
  };
  const created = await ok(
    await request.post("/v1/skills", {
      multipart: { "files[]": bundle, display_name: name },
    }),
  );
  // Capture the ID before schema validation, so a drift failure still cleans up.
  const id = created.id;
  expect(typeof id).toBe("string");
  try {
    const skill = SkillSchema.parse(created);
    expect(skill.display_name).toBe(name);
    expect(skill.source.type).toBe("custom");
    expect(skill.latest_version_id).toMatch(/^skver_/);
    SkillSchema.parse(await ok(await request.get(`/v1/skills/${id}`)));
    const original = SkillVersionSchema.parse(
      await ok(await request.get(`/v1/skills/${id}/versions/latest`)),
    );
    expect(original.id).toBe(skill.latest_version_id);
    const second = SkillVersionSchema.parse(
      await ok(
        await request.post(`/v1/skills/${id}/versions`, {
          multipart: { "files[]": bundle },
        }),
      ),
    );
    const page = await ok(
      await request.get(`/v1/skills/${id}/versions?limit=1`),
    );
    expect(page.data).toHaveLength(1);
    SkillVersionSchema.parse(page.data[0]);
    expect(page.next_page).toBeTruthy();
    const next = await ok(
      await request.get(`/v1/skills/${id}/versions`, {
        params: { limit: 1, page: page.next_page },
      }),
    );
    expect(new Set([page.data[0].id, next.data[0].id]).size).toBe(2);
    const download = await request.get(
      `/v1/skills/${id}/versions/${second.id}/content`,
    );
    expect(download.status()).toBe(200);
    expect((await download.body()).subarray(0, 2).toString()).toBe("PK");
    await ok(await request.delete(`/v1/skills/${id}/versions/${second.id}`));
    expect(
      (
        await request.delete(`/v1/skills/${id}/versions/${original.id}`)
      ).status(),
    ).toBe(400);
  } finally {
    expect((await request.delete(`/v1/skills/${id}`)).status()).toBe(200);
    expect((await request.get(`/v1/skills/${id}`)).status()).toBe(404);
    expect((await request.get(`/v1/skills/${id}/versions`)).status()).toBe(404);
  }
});
