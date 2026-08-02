import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useCursorPage } from "./use-cursor-page";

describe("useCursorPage", () => {
  it("starts at the first page with no history", () => {
    const { result } = renderHook(() => useCursorPage("k"));
    expect(result.current.page).toBeUndefined();
    expect(result.current.hasPrev).toBe(false);
  });

  it("stacks pages forward and pops them back", () => {
    const { result } = renderHook(() => useCursorPage("k"));

    act(() => result.current.goNext("tok_2"));
    expect(result.current.page).toBe("tok_2");
    expect(result.current.hasPrev).toBe(true);

    act(() => result.current.goNext("tok_3"));
    expect(result.current.page).toBe("tok_3");

    act(() => result.current.goPrev());
    expect(result.current.page).toBe("tok_2");
    expect(result.current.hasPrev).toBe(true);

    act(() => result.current.goPrev());
    expect(result.current.page).toBeUndefined();
    expect(result.current.hasPrev).toBe(false);
  });

  it("ignores goPrev on the first page", () => {
    const { result } = renderHook(() => useCursorPage("k"));
    act(() => result.current.goPrev());
    expect(result.current.page).toBeUndefined();
    expect(result.current.hasPrev).toBe(false);
  });

  it("resets to the first page when the key changes", () => {
    const { result, rerender } = renderHook(
      ({ resetKey }) => useCursorPage(resetKey),
      { initialProps: { resetKey: "status=active" } },
    );
    act(() => result.current.goNext("tok_2"));
    expect(result.current.page).toBe("tok_2");

    rerender({ resetKey: "status=archived" });
    expect(result.current.page).toBeUndefined();
    expect(result.current.hasPrev).toBe(false);

    // Paging after the reset builds on the fresh stack, not the stale one.
    act(() => result.current.goNext("tok_9"));
    expect(result.current.page).toBe("tok_9");
    act(() => result.current.goPrev());
    expect(result.current.page).toBeUndefined();
    expect(result.current.hasPrev).toBe(false);
  });
});
