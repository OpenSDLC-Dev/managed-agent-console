import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  costText,
  dayLabel,
  exactCount,
  lastDays,
  duration,
  tokenCount,
} from "./usage-bits";
import { CostChart, niceScale } from "./cost-chart";

afterEach(cleanup);

// The one test of each usage formatter's strings.
describe("usage formatters", () => {
  it("compacts token counts, and dashes one the upstream did not report", () => {
    expect(tokenCount(412_600_000)).toBe("412.6M");
    expect(tokenCount(18_204)).toBe("18.2K");
    expect(tokenCount(0)).toBe("0");
    expect(tokenCount(null)).toBe("—");
  });

  it("writes an exact count with separators", () => {
    expect(exactCount(18_204)).toBe("18,204");
    expect(exactCount(null)).toBe("—");
  });

  // A cost under a cent keeps two significant digits, so a cheap request
  // does not read as free (PR #223 review).
  it("probe: writes cost to the cent, a cost under it in two digits, with no currency", () => {
    expect(costText(1204.5)).toBe("1,204.50");
    expect(costText(0.0485)).toBe("0.05");
    expect(costText(0.000512)).toBe("0.00051");
    expect(costText(0)).toBe("0.00");
    expect(costText(null)).toBe("—");
  });

  // A fast call read "0.0s", the same as no time at all (PR #223 review).
  it("probe: writes a duration in seconds, and one under a second in ms", () => {
    expect(duration(8400)).toBe("8.4s");
    expect(duration(999.6)).toBe("1.0s");
    expect(duration(12.4)).toBe("12ms");
    expect(duration(0.42)).toBe("0.4ms");
  });

  it("labels a UTC day, whatever the local zone", () => {
    expect(dayLabel("2026-10-01")).toBe("Oct 1");
  });

  it("spans the UTC days ending today, both included", () => {
    expect(lastDays(30, new Date("2026-10-15T23:30:00Z"))).toEqual({
      from: "2026-09-16",
      to: "2026-10-15",
    });
  });
});

describe("niceScale", () => {
  it.each([
    [73, { top: 80, step: 20, decimals: 0 }],
    [0.42, { top: 0.6, step: 0.2, decimals: 2 }],
    [1204, { top: 1500, step: 500, decimals: 0 }],
    [9, { top: 10, step: 2.5, decimals: 1 }],
    [0, { top: 1, step: 0.25, decimals: 2 }],
  ])("%s → %o", (max, scale) => {
    expect(niceScale(max)).toEqual(scale);
  });

  // Two decimals labelled every tick under a cent "0.00", and a 0.025 step
  // "0.03" (PR #223 review).
  it.each([
    [0.003, { top: 0.003, step: 0.001, decimals: 3 }],
    [0.09, { top: 0.1, step: 0.025, decimals: 3 }],
  ])("probe: %s → %o, enough decimals for each tick", (max, scale) => {
    expect(niceScale(max)).toEqual(scale);
  });
});

describe("CostChart", () => {
  const days = [
    { day: "2026-10-13", cost: 0 },
    { day: "2026-10-14", cost: 42.5 },
    { day: "2026-10-15", cost: 10 },
  ];

  it("draws a bar a day, each carrying its day and cost", () => {
    render(<CostChart days={days} />);
    const bars = screen.getAllByRole("listitem");
    expect(bars.map((b) => b.getAttribute("data-cost"))).toEqual([
      "0",
      "42.5",
      "10",
    ]);
  });

  it.each([
    [7, 1],
    [30, 5],
    [90, 5],
  ])(
    "probe: labels %s days with at most five dates, whole weeks apart",
    (n, labels) => {
      const span = Array.from({ length: n }, (_, i) => ({
        day: new Date(Date.UTC(2026, 6, 1 + i)).toISOString().slice(0, 10),
        cost: 1,
      }));
      render(<CostChart days={span} />);
      const shown = [...document.querySelectorAll("[data-axis-day]")];
      expect(shown).toHaveLength(labels);
      const apart =
        (Date.parse(shown[1]?.getAttribute("data-axis-day") ?? "") -
          Date.parse(shown[0].getAttribute("data-axis-day")!)) /
        86_400_000;
      if (labels > 1) expect(apart % 7).toBe(0);
    },
  );

  it("answers hover and focus with the bar's day and value", () => {
    render(<CostChart days={days} />);
    const bar = screen.getAllByRole("listitem")[1];
    fireEvent.mouseEnter(bar);
    expect(screen.getByRole("tooltip")).toHaveTextContent(
      `${dayLabel("2026-10-14")} · ${costText(42.5)}`,
    );
    fireEvent.mouseLeave(bar.parentElement!);
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.focus(bar);
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
  });
});
