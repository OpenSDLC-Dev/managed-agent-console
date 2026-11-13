// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Browser, Page } from "@playwright/test";
import { expect, it, vi } from "vitest";

type NativeCallback = (fixtures: {
  page: Page;
  browser: Browser;
}) => Promise<void>;
const { callbacks, ui } = vi.hoisted(() => ({
  callbacks: new Map<string, NativeCallback>(),
  ui: new Set<unknown>(),
}));
vi.mock("../test/native/test", () => ({
  test: Object.assign(
    (name: string, callback: NativeCallback) => callbacks.set(name, callback),
    { setTimeout: vi.fn() },
  ),
  expect: (value: unknown, message?: string) =>
    ui.has(value)
      ? { toBeVisible() {}, toHaveURL() {} }
      : expect(value, message),
}));
vi.mock("node:fs", async (original) => {
  const fs = await original<typeof import("node:fs")>();
  return { ...fs, readFileSync: vi.fn(fs.readFileSync) };
});
vi.mock("node:child_process", async (original) => ({
  ...(await original<typeof import("node:child_process")>()),
  spawnSync: vi.fn(),
}));
vi.mock("../test/native/docker", () => ({
  nativeDocker: () => {
    throw new Error("Unexpected Docker call");
  },
}));

it.each([false, true])(
  "native SDK caller reaches the executable with receipt rewrite=%s",
  async (rewrite) => {
    const fs = await vi.importActual<typeof import("node:fs")>("node:fs");
    const cp =
      await vi.importActual<typeof import("node:child_process")>(
        "node:child_process",
      );
    const dir = mkdtempSync(join(tmpdir(), "sdk-receipt-"));
    const path = join(dir, "task6-native-receipt.json");
    const executable = join(dir, "sdk-client");
    const reached = new Error("stopped at the actual SDK process boundary");
    let armed = false;
    let observationReads = 0;
    const close = vi.fn(async () => {});
    try {
      vi.stubEnv("NATIVE_EVIDENCE_DIR", dir);
      vi.stubGlobal("fetch", () => {
        throw new Error("Unexpected network call");
      });
      writeFileSync(path, JSON.stringify({ dir, sdkClient: executable }));
      writeFileSync(join(dir, "password-setup-code"), "synthetic-setup");
      vi.mocked(readFileSync).mockImplementation((...args) => {
        const value = fs.readFileSync(...args);
        if (args[0] === path && armed) {
          observationReads++;
          // Return the current observation, then hold the next rewrite between
          // truncation and JSON completion. No sleep or probabilistic race.
          if (rewrite) writeFileSync(path, "{");
        }
        return value;
      });
      vi.mocked(spawnSync).mockImplementation(() => {
        throw reached;
      });
      // Stub browser activity and stop at process creation. Execute the real
      // native callback, including receipt(), sdk() and the first SDK call site.
      const locator = {
        fill: async () => {},
        click: async () => {},
        textContent: async () => "synthetic-owned-key",
      };
      ui.add(locator);
      const page = {
        request: {
          post: async () => ({ status: () => 200 }),
          get: async () => ({ json: async () => ({ id: "user_root" }) }),
        },
        goto: async () => {},
        on: () => {},
        evaluate: async (_fn: unknown, args: { url: string }) => ({
          status: 200,
          body: {
            id: args.url.endsWith("/members") ? "user_human" : "svac_service",
          },
        }),
        getByLabel: () => locator,
        getByRole: () => locator,
        getByTestId: (id: string) =>
          id === "close-revealed-api-key"
            ? {
                click: async () => {
                  // Request evidence must still be read after UI activity.
                  writeFileSync(
                    path,
                    JSON.stringify({
                      dir,
                      sdkClient: executable,
                      publicRequests: [],
                    }),
                  );
                  armed = true;
                },
              }
            : locator,
        waitForResponse: async () => ({
          status: () => 200,
          json: async () => ({
            id: "key_synthetic",
            raw_key: "synthetic-owned-key",
            principal: { type: "user_actor", user_id: "user_human" },
            created_by: { type: "user", id: "user_human" },
            workspace_id: null,
          }),
          request: () => ({
            postDataJSON: () => ({ principal_id: "user_human" }),
          }),
        }),
      };
      ui.add(page);
      await import("../test/native/contract.spec");
      const callback = callbacks.get(
        "native-issued human and service keys preserve SDK actors and current authority",
      );
      expect(callback).toBeDefined();
      await callback!({
        page: page as unknown as Page,
        browser: {
          newContext: async () => ({ newPage: async () => page, close }),
        } as unknown as Browser,
      }).catch((error: unknown) => {
        if (error !== reached) throw error;
      });
      expect(observationReads).toBeGreaterThan(0);
      if (rewrite) expect(observationReads).toBe(1);
      expect(spawnSync).toHaveBeenCalledExactlyOnceWith(
        executable,
        [],
        expect.objectContaining({
          input: JSON.stringify({
            base_url: "http://127.0.0.1:38200",
            key: "synthetic-owned-key",
            header: "x-api-key",
          }),
        }),
      );
      if (rewrite) expect(fs.readFileSync(path, "utf8")).toBe("{");
      expect(close).toHaveBeenCalledOnce();
    } finally {
      vi.mocked(readFileSync).mockReset().mockImplementation(fs.readFileSync);
      vi.mocked(spawnSync).mockReset().mockImplementation(cp.spawnSync);
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
      ui.clear();
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
