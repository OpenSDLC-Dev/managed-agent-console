import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useNow } from "./use-now";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-04T12:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useNow", () => {
  it("returns the current time and refreshes on the interval", () => {
    const { result } = renderHook(() => useNow(30_000));
    expect(result.current).toBe(Date.parse("2026-08-04T12:00:00Z"));

    act(() => {
      vi.advanceTimersByTime(30_000);
    });
    expect(result.current).toBe(Date.parse("2026-08-04T12:00:30Z"));
  });

  it("clears its interval on unmount", () => {
    const clearSpy = vi.spyOn(window, "clearInterval");
    const { unmount } = renderHook(() => useNow(1_000));
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });
});
