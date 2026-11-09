import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

it("native runtime environment contracts (no resources)", () => {
  expect(() => {
    let started = Number.NaN;
    try {
      started = performance.now();
    } catch {
      // Diagnostics must not prevent the original call.
    }
    let returned = false;
    let failure: unknown;
    try {
      execFileSync(
        process.execPath,
        ["--test", resolve("test/native/environment.test.mjs")],
        { timeout: 30_000, stdio: "inherit" },
      );
      returned = true;
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      // A normal return is execFileSync's success contract, not a separately
      // observed OS status/signal tuple. Emit before Vitest checks its budget.
      try {
        const elapsedMs = performance.now() - started;
        const result = failure as
          { code?: unknown; status?: unknown; signal?: unknown } | undefined;
        const code = result?.code;
        const signal = result?.signal;
        if (Number.isFinite(elapsedMs) && elapsedMs >= 0)
          console.log(
            "native-environment-timing",
            JSON.stringify({
              case: "aggregate",
              launcher: "direct Node",
              phase: "suite",
              elapsedMs,
              api: "execFileSync",
              outcome: returned ? "returned" : "threw",
              code:
                code == null
                  ? null
                  : [
                        "ENOENT",
                        "EACCES",
                        "EPERM",
                        "EINVAL",
                        "ETIMEDOUT",
                        "ENOBUFS",
                      ].includes(code as string)
                    ? code
                    : "other",
              status: Number.isSafeInteger(result?.status)
                ? result?.status
                : null,
              signal:
                signal == null
                  ? null
                  : [
                        "SIGTERM",
                        "SIGKILL",
                        "SIGINT",
                        "SIGABRT",
                        "SIGSEGV",
                      ].includes(signal as string)
                    ? signal
                    : "other",
            }),
          );
      } catch {
        // Diagnostics must not replace the original error or assertion.
      }
    }
  }).not.toThrow();
});
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
