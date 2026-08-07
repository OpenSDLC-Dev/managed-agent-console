import { describe, expect, it } from "vitest";
import {
  ageLabel,
  durationLabel,
  idleGaps,
  modelSpanDurations,
  offsetLabel,
} from "./timing";
import type { SessionEvent } from "@/lib/platform/types";

const ev = (
  id: string,
  type: string,
  processed_at: string | null,
  extra?: object,
): SessionEvent => ({ id, type, processed_at, ...extra }) as SessionEvent;

describe("offsetLabel", () => {
  it("formats minutes and hours since the origin", () => {
    expect(offsetLabel("2026-08-01T09:00:00Z", "2026-08-01T09:00:09Z")).toBe(
      "0:09",
    );
    expect(offsetLabel("2026-08-01T09:00:00Z", "2026-08-01T10:02:03Z")).toBe(
      "1:02:03",
    );
  });

  it("origin regression: session created before the first event shows the idle interval", () => {
    // An implementation using the first event as origin would render 0:00.
    expect(offsetLabel("2026-08-01T09:00:00Z", "2026-08-01T09:00:47Z")).toBe(
      "0:47",
    );
  });

  it("probe: is null-safe and clamps skew to zero", () => {
    expect(offsetLabel(null, "2026-08-01T09:00:00Z")).toBeNull();
    expect(offsetLabel("2026-08-01T09:00:00Z", null)).toBeNull();
    expect(offsetLabel("not-a-date", "2026-08-01T09:00:00Z")).toBeNull();
    expect(offsetLabel("2026-08-01T09:00:10Z", "2026-08-01T09:00:00Z")).toBe(
      "0:00",
    );
  });
});

describe("durationLabel", () => {
  it("scales units", () => {
    expect(durationLabel(300)).toBe("<1s");
    expect(durationLabel(3_000)).toBe("3s");
    expect(durationLabel(64_000)).toBe("1m 04s");
    expect(durationLabel(2 * 3600_000 + 15 * 60_000)).toBe("2h 15m");
    expect(durationLabel(3 * 86400_000 + 2 * 3600_000)).toBe("3d 2h");
  });
});

describe("modelSpanDurations", () => {
  const start = ev("s1", "span.model_request_start", "2026-08-01T09:00:00Z");
  const end = ev("e1", "span.model_request_end", "2026-08-01T09:00:03Z", {
    model_request_start_id: "s1",
  });

  it("pairs an end with its start by model_request_start_id", () => {
    expect(modelSpanDurations([start, end])).toEqual(new Map([["e1", 3_000]]));
  });

  it("probe: skips unpaired, unstamped, and negative spans", () => {
    const orphan = ev("e2", "span.model_request_end", "2026-08-01T09:00:05Z", {
      model_request_start_id: "missing",
    });
    const unstamped = ev("e3", "span.model_request_end", null, {
      model_request_start_id: "s1",
    });
    const noId = ev("e4", "span.model_request_end", "2026-08-01T09:00:05Z");
    const backwards = ev(
      "e5",
      "span.model_request_end",
      "2026-08-01T08:59:00Z",
      { model_request_start_id: "s1" },
    );
    expect(
      modelSpanDurations([start, orphan, unstamped, noId, backwards]),
    ).toEqual(new Map());
  });
});

describe("idleGaps", () => {
  it("keys the gap by the idle event when the next running is past the threshold", () => {
    const events = [
      ev("i1", "session.status_idle", "2026-08-01T09:00:00Z"),
      ev("r1", "session.status_running", "2026-08-01T09:00:25Z"),
    ];
    expect(idleGaps(events)).toEqual(new Map([["i1", 25_000]]));
  });

  it("probe: ignores sub-threshold churn, trailing idles, and unstamped pairs", () => {
    const events = [
      ev("i1", "session.status_idle", "2026-08-01T09:00:00Z"),
      ev("r1", "session.status_running", "2026-08-01T09:00:02Z"),
      ev("i2", "session.status_idle", null),
      ev("r2", "session.status_running", "2026-08-01T09:01:00Z"),
      ev("i3", "session.status_idle", "2026-08-01T09:02:00Z"),
    ];
    expect(idleGaps(events)).toEqual(new Map());
  });

  it("pairs each idle with only the next running", () => {
    const events = [
      ev("i1", "session.status_idle", "2026-08-01T09:00:00Z"),
      ev("m1", "user.message", "2026-08-01T09:00:30Z"),
      ev("r1", "session.status_running", "2026-08-01T09:00:30Z"),
      ev("i2", "session.status_idle", "2026-08-01T09:01:00Z"),
      ev("r2", "session.status_running", "2026-08-01T09:03:00Z"),
    ];
    expect(idleGaps(events)).toEqual(
      new Map([
        ["i1", 30_000],
        ["i2", 120_000],
      ]),
    );
  });
});

describe("ageLabel", () => {
  const now = Date.parse("2026-08-04T12:00:00Z");
  it("renders relative ages", () => {
    expect(ageLabel("2026-08-04T11:59:30Z", now)).toBe("just now");
    expect(ageLabel("2026-08-04T11:45:00Z", now)).toBe("15 minutes ago");
    expect(ageLabel("2026-08-04T11:00:00Z", now)).toBe("1 hour ago");
    expect(ageLabel("2026-08-02T12:00:00Z", now)).toBe("2 days ago");
  });
  it("probe: is null-safe", () => {
    expect(ageLabel(null, now)).toBeNull();
    expect(ageLabel("bogus", now)).toBeNull();
  });
});
