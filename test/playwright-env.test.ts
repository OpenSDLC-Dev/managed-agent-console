import { afterEach, describe, expect, it, vi } from "vitest";
import { ensureLoopbackProxyBypass } from "./playwright-env";

vi.mock("./e2e-live/env", () => ({
  LIVE_CONSOLE_PASSWORD: "synthetic-password",
  resolveLiveEnv: () => ({
    baseUrl: "http://127.0.0.1:9",
    apiKey: "synthetic-key",
  }),
}));
afterEach(() => vi.unstubAllEnvs());

it("probe: legacy browser fixtures cannot inherit native runtime mode from the invoking shell", async () => {
  vi.stubEnv("CONSOLE_AUTH_MODE", "platform");
  const configs = [
    (await import("../playwright.config")).default,
    (await import("../playwright.fidelity.config")).default,
    (await import("../playwright.live.config")).default,
  ];
  let consoles = 0;
  for (const config of configs) {
    const servers = Array.isArray(config.webServer)
      ? config.webServer
      : [config.webServer];
    for (const server of servers) {
      if (!server?.command.includes("next start")) continue;
      consoles++;
      expect(server.env?.CONSOLE_AUTH_MODE, server.command).toBe("");
    }
  }
  expect(consoles).toBe(4);
});

describe("ensureLoopbackProxyBypass", () => {
  it("merges existing entries and puts every loopback host in both variables", () => {
    const env = {
      NO_PROXY: "internal.example,localhost",
      no_proxy: "metadata.example,127.0.0.1",
    };

    ensureLoopbackProxyBypass(env);

    const expected =
      "internal.example,localhost,metadata.example,127.0.0.1,::1";
    expect(env.NO_PROXY).toBe(expected);
    expect(env.no_proxy).toBe(expected);
  });
});
