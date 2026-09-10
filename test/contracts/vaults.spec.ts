import { expect, type APIResponse } from "@playwright/test";
import {
  VaultCredentialSchema,
  VaultSchema,
} from "../../src/lib/platform/schemas";
import { test } from "./fixtures";

test("vault and credential update, listing and archive lifecycle", async ({
  request,
}) => {
  const ok = async (response: APIResponse) => {
    expect(response.status(), `Unexpected status for ${response.url()}`).toBe(
      200,
    );
    return response.json();
  };
  const stamp = Date.now();
  let vaultId: string | undefined;
  try {
    const created = VaultSchema.parse(
      await ok(
        await request.post("/v1/vaults", {
          data: {
            display_name: `console-contract-${stamp}`,
            metadata: { phase: "created", remove: "yes" },
          },
        }),
      ),
    );
    vaultId = created.id;

    const updated = VaultSchema.parse(
      await ok(
        await request.post(`/v1/vaults/${created.id}`, {
          data: {
            display_name: `console-contract-updated-${stamp}`,
            metadata: { phase: "updated", remove: null },
          },
        }),
      ),
    );
    expect(updated.metadata).toEqual({ phase: "updated" });

    const credential = VaultCredentialSchema.parse(
      await ok(
        await request.post(`/v1/vaults/${created.id}/credentials`, {
          data: {
            display_name: "contract secret",
            metadata: { phase: "created", remove: "yes" },
            auth: {
              type: "environment_variable",
              secret_name: `CONSOLE_CONTRACT_${stamp}`,
              secret_value: "first-secret",
              networking: { type: "limited", allowed_hosts: ["example.com"] },
              injection_location: { header: true, body: false },
            },
          },
        }),
      ),
    );
    expect(JSON.stringify(credential)).not.toContain("first-secret");

    const patched = VaultCredentialSchema.parse(
      await ok(
        await request.post(
          `/v1/vaults/${created.id}/credentials/${credential.id}`,
          {
            data: {
              display_name: null,
              metadata: { phase: "updated", remove: null },
              auth: {
                type: "environment_variable",
                secret_value: "rotated-secret",
                networking: { type: "unrestricted" },
                injection_location: { body: true },
              },
            },
          },
        ),
      ),
    );
    expect(patched).toMatchObject({
      display_name: null,
      metadata: { phase: "updated" },
      auth: {
        type: "environment_variable",
        networking: { type: "unrestricted" },
        injection_location: { header: true, body: true },
      },
    });
    expect(JSON.stringify(patched)).not.toContain("rotated-secret");

    expect(
      VaultCredentialSchema.parse(
        await ok(
          await request.get(
            `/v1/vaults/${created.id}/credentials/${credential.id}`,
          ),
        ),
      ),
    ).toEqual(patched);

    const archived = VaultCredentialSchema.parse(
      await ok(
        await request.post(
          `/v1/vaults/${created.id}/credentials/${credential.id}/archive`,
          { data: {} },
        ),
      ),
    );
    expect(archived.archived_at).not.toBeNull();
    const listed = await ok(
      await request.get(
        `/v1/vaults/${created.id}/credentials?include_archived=true`,
      ),
    );
    expect(listed.data).toContainEqual(archived);

    await ok(await request.delete(`/v1/vaults/${created.id}`));
    vaultId = undefined;
  } finally {
    if (vaultId) await request.delete(`/v1/vaults/${vaultId}`);
  }
});
