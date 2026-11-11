import { afterEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { performance } from "node:perf_hooks";

function readClock(now: () => unknown = () => performance.now()): number {
  const reading = now();
  return typeof reading === "number" && Number.isFinite(reading)
    ? reading
    : Number.NaN;
}

it.each([0, 100, -100])(
  "aggregate clock accepts finite reading %s",
  (reading) => {
    expect(readClock(() => reading)).toBe(reading);
  },
);
it.each([null, "100", true, false, Number.NaN, Infinity, -Infinity, undefined])(
  "aggregate clock rejects raw reading %s",
  (reading) => {
    expect(readClock(() => reading)).toBeNaN();
  },
);
it("aggregate clock never coerces an object", () => {
  let coercions = 0;
  const reading = {
    [Symbol.toPrimitive]() {
      coercions++;
      return 100;
    },
  };
  expect(readClock(() => reading)).toBeNaN();
  expect(coercions).toBe(0);
});
it("aggregate clock preserves a reading exception", () => {
  const original = new Error("unavailable clock");
  expect(() =>
    readClock(() => {
      throw original;
    }),
  ).toThrow(original);
});

function runNativeEnvironmentContracts(
  run: () => void = () => {
    execFileSync(
      process.execPath,
      ["--test", resolve("test/native/environment.test.mjs")],
      { timeout: 30_000, stdio: "inherit" },
    );
  },
  now: () => unknown = () => performance.now(),
  emit: (marker: string, record: string) => void = (marker, record) =>
    console.log(marker, record),
  evidence?: { unavailable: boolean },
) {
  let started = Number.NaN;
  try {
    started = readClock(now);
  } catch {
    // Diagnostics must not prevent the original call.
  }
  let returned = false;
  let failure: unknown;
  try {
    run();
    returned = true;
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    // A normal return is execFileSync's success contract, not a separately
    // observed OS status/signal tuple. Emit before Vitest checks its budget.
    try {
      const elapsedMs = readClock(now) - started;
      const result = failure as
        { code?: unknown; status?: unknown; signal?: unknown } | undefined;
      const code = result?.code;
      const signal = result?.signal;
      if (Number.isFinite(elapsedMs) && elapsedMs >= 0)
        emit(
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
      else if (evidence) evidence.unavailable = true;
    } catch {
      if (evidence) evidence.unavailable = true;
      // Diagnostics must not replace the original error or assertion.
    }
  }
}

describe.each(["returned", "threw"] as const)(
  "native environment aggregate caller %s",
  (outcome) => {
    const coercible = Symbol("coercible reading");
    const clockException = Symbol("clock exception");
    const invalidReadings = [
      { name: "null", value: null },
      { name: "numeric string", value: "100" },
      { name: "true", value: true },
      { name: "false", value: false },
      { name: "NaN", value: Number.NaN },
      { name: "infinity", value: Infinity },
      { name: "negative infinity", value: -Infinity },
      { name: "undefined", value: undefined },
      { name: "coercible object", value: coercible },
      { name: "clock exception", value: clockException },
    ];
    const cases: {
      name: string;
      readings: unknown[];
      elapsedMs: number | null;
      sinkThrows?: boolean;
    }[] = [
      { name: "valid timing", readings: [100, 1120], elapsedMs: 1020 },
      { name: "zero interval", readings: [100, 100], elapsedMs: 0 },
      { name: "backwards clock", readings: [100, 90], elapsedMs: null },
      {
        name: "sink exception",
        readings: [100, 1120],
        elapsedMs: 1020,
        sinkThrows: true,
      },
      ...["first", "end"].flatMap((endpoint) =>
        invalidReadings.map(({ name, value }) => ({
          name: `${endpoint} ${name}`,
          readings: endpoint === "first" ? [value, 1120] : [100, value],
          elapsedMs: null,
        })),
      ),
    ];

    it.each(cases)("$name", ({ readings, elapsedMs, sinkThrows }) => {
      const samples = [...readings];
      const records: [string, string][] = [];
      const order: string[] = [];
      const original = Object.assign(new Error("private child failure"), {
        code: "ETIMEDOUT",
        status: 23,
        signal: "SIGTERM",
        stdout: "private child output",
      });
      let operations = 0;
      let clockReads = 0;
      let coercions = 0;
      let completed = false;
      let caught: unknown;
      let result: unknown = "not returned";
      const evidence = { unavailable: false };
      try {
        result = runNativeEnvironmentContracts(
          () => {
            operations++;
            order.push("operation");
            if (outcome === "threw") throw original;
          },
          () => {
            clockReads++;
            order.push("clock");
            const sample = samples.shift();
            if (sample === clockException) throw new Error("private clock");
            if (sample === coercible)
              return {
                [Symbol.toPrimitive]() {
                  coercions++;
                  return 100;
                },
              };
            return sample;
          },
          (marker, record) => {
            records.push([marker, record]);
            if (sinkThrows) throw new Error("private sink");
          },
          evidence,
        );
        completed = true;
      } catch (error) {
        caught = error;
      }
      expect(operations).toBe(1);
      expect(clockReads).toBe(2);
      expect(samples).toEqual([]);
      expect(order).toEqual(["clock", "operation", "clock"]);
      expect(coercions).toBe(0);
      expect(completed).toBe(outcome === "returned");
      expect(caught).toBe(outcome === "threw" ? original : undefined);
      expect(result).toBe(outcome === "returned" ? undefined : "not returned");
      expect(
        records.map(([marker, record]) => [marker, JSON.parse(record)]),
      ).toEqual(
        elapsedMs === null
          ? []
          : [
              [
                "native-environment-timing",
                {
                  case: "aggregate",
                  launcher: "direct Node",
                  phase: "suite",
                  elapsedMs,
                  api: "execFileSync",
                  outcome,
                  code: outcome === "threw" ? "ETIMEDOUT" : null,
                  status: outcome === "threw" ? 23 : null,
                  signal: outcome === "threw" ? "SIGTERM" : null,
                },
              ],
            ],
      );
      expect(evidence.unavailable).toBe(elapsedMs === null || !!sinkThrows);
    });
  },
);

it.each([
  { name: "absent", fields: {}, code: null, status: null, signal: null },
  {
    name: "unknown private fields",
    fields: { code: "private code", status: "23", signal: "private signal" },
    code: "other",
    status: null,
    signal: "other",
  },
  {
    name: "nonfinite status",
    fields: { code: "ENOENT", status: Infinity, signal: "SIGKILL" },
    code: "ENOENT",
    status: null,
    signal: "SIGKILL",
  },
  {
    name: "unsafe status",
    fields: {
      code: "EACCES",
      status: Number.MAX_SAFE_INTEGER + 1,
      signal: "SIGINT",
    },
    code: "EACCES",
    status: null,
    signal: "SIGINT",
  },
])(
  "native environment aggregate caller filters $name",
  ({ fields, code, status, signal }) => {
    const original = Object.assign(new Error("private original"), fields, {
      path: "private path",
      stderr: "private stderr",
    });
    const samples = [100, 1120];
    const records: [string, string][] = [];
    let operations = 0;
    let clockReads = 0;
    let caught: unknown;
    const evidence = { unavailable: false };
    try {
      runNativeEnvironmentContracts(
        () => {
          operations++;
          throw original;
        },
        () => {
          clockReads++;
          return samples.shift();
        },
        (marker, record) => records.push([marker, record]),
        evidence,
      );
    } catch (error) {
      caught = error;
    }
    expect(operations).toBe(1);
    expect(clockReads).toBe(2);
    expect(samples).toEqual([]);
    expect(caught).toBe(original);
    expect(
      records.map(([marker, record]) => [marker, JSON.parse(record)]),
    ).toEqual([
      [
        "native-environment-timing",
        {
          case: "aggregate",
          launcher: "direct Node",
          phase: "suite",
          elapsedMs: 1020,
          api: "execFileSync",
          outcome: "threw",
          code,
          status,
          signal,
        },
      ],
    ]);
    expect(evidence.unavailable).toBe(false);
  },
);

it("native runtime environment contracts (no resources)", () => {
  const observedOutput: { records: string[]; invalid: boolean } = {
    records: [],
    invalid: false,
  };
  const evidence = { unavailable: false };
  const originalLog = console.log;
  console.log = function (...args) {
    const result = originalLog.apply(console, args);
    if (
      args.length === 2 &&
      args[0] === "native-environment-timing" &&
      typeof args[1] === "string" &&
      args[1].length <= 1024 &&
      observedOutput.records.length < 1
    )
      observedOutput.records.push(args[1]);
    else observedOutput.invalid = true;
    return result;
  };
  try {
    expect(() =>
      runNativeEnvironmentContracts(undefined, undefined, undefined, evidence),
    ).not.toThrow();
  } finally {
    console.log = originalLog;
  }
  expect(
    !observedOutput.invalid,
    "aggregate timing must use a bounded fixed-marker record",
  ).toBe(true);
  if (evidence.unavailable) return;
  expect(
    observedOutput.records.length === 1,
    "available aggregate timing must emit once",
  ).toBe(true);
  let record: unknown;
  let parsed = false;
  try {
    record = JSON.parse(observedOutput.records[0]);
    parsed = true;
  } catch {
    // Report only a fixed message below, never the private parser preview.
  }
  expect(parsed, "aggregate timing record must be valid JSON").toBe(true);
  expect(
    record !== null && typeof record === "object" && !Array.isArray(record),
    "aggregate timing record must be an object",
  ).toBe(true);
  const fields = record as Record<string, unknown>;
  expect(
    Object.keys(fields).sort().join(",") ===
      "api,case,code,elapsedMs,launcher,outcome,phase,signal,status",
    "aggregate timing must use only the fixed fields",
  ).toBe(true);
  expect(
    fields.case === "aggregate" &&
      fields.launcher === "direct Node" &&
      fields.phase === "suite",
    "aggregate timing identity and phase must match the actual path",
  ).toBe(true);
  expect(
    typeof fields.elapsedMs === "number" &&
      Number.isFinite(fields.elapsedMs) &&
      fields.elapsedMs >= 0,
    "aggregate timing duration must be finite and nonnegative",
  ).toBe(true);
  expect(
    fields.api === "execFileSync" &&
      fields.outcome === "returned" &&
      fields.code === null &&
      fields.status === null &&
      fields.signal === null,
    "aggregate timing must preserve the actual API success contract",
  ).toBe(true);
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
