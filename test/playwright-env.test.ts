import { describe, expect, it } from "vitest";
import { ensureLoopbackProxyBypass } from "./playwright-env";

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
