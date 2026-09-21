// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadEnvConfig } from "@next/env";

vi.mock("@next/env", () => ({ loadEnvConfig: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  vi.mocked(loadEnvConfig).mockReset();
  vi.stubEnv("RUN_LIVE_CONTRACT_TESTS", "1");
  vi.stubEnv("RUN_LIVE_MODEL_CONTRACT_TESTS", undefined);
  vi.stubEnv("PLATFORM_BASE_URL", "http://127.0.0.1:8080");
  vi.stubEnv("PLATFORM_API_KEY", "config-test-only");
});

afterEach(() => vi.unstubAllEnvs());

describe("contract model-spend consent", () => {
  it.each([undefined, "0"])(
    "does not let dotenv enable model contracts when the caller supplied %s",
    async (consent) => {
      vi.stubEnv("RUN_LIVE_MODEL_CONTRACT_TESTS", consent);
      vi.mocked(loadEnvConfig).mockImplementation(() => {
        vi.stubEnv("RUN_LIVE_MODEL_CONTRACT_TESTS", "1");
        return {
          combinedEnv: process.env,
          parsedEnv: { RUN_LIVE_MODEL_CONTRACT_TESTS: "1" },
          loadedEnvFiles: [],
        };
      });

      const { default: config } = await import("../playwright.contract.config");

      expect(loadEnvConfig).toHaveBeenCalled();
      expect(config.projects?.map((project) => project.name)).toEqual([
        "model-free",
      ]);
    },
  );

  it("includes model contracts with the caller's explicit opt-in", async () => {
    vi.stubEnv("RUN_LIVE_MODEL_CONTRACT_TESTS", "1");

    const { default: config } = await import("../playwright.contract.config");

    expect(config.projects?.map((project) => project.name)).toEqual([
      "model-free",
      "model-backed",
    ]);
  });

  it("still requires the live-write opt-in before reading dotenv", async () => {
    vi.stubEnv("RUN_LIVE_CONTRACT_TESTS", undefined);
    vi.stubEnv("RUN_LIVE_MODEL_CONTRACT_TESTS", "1");

    await expect(import("../playwright.contract.config")).rejects.toThrow(
      "RUN_LIVE_CONTRACT_TESTS=1",
    );
    expect(loadEnvConfig).not.toHaveBeenCalled();
  });
});
