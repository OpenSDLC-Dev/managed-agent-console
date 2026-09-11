import {
  decodeCreatedFilter,
  encodeCreatedFilter,
} from "./created-filter-state";
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import {
  CreatedFilter,
  createdSelection,
  createdGte,
  parseCreatedDate,
} from "./created-filter";
afterEach(cleanup);
it("uses actual calendar dates and keeps open bounds inclusive", () => {
  expect(parseCreatedDate("2026-02-30")).toBeUndefined();
  expect(parseCreatedDate("2024-02-29")?.getDate()).toBe(29);
  expect(parseCreatedDate("bad")).toBeUndefined();
  expect(
    createdSelection("custom", { start: "", end: "2026-08-02" }),
  ).toMatchObject({
    gte: undefined,
    lte: new Date(2026, 7, 2, 23, 59, 59, 999)
      .toISOString()
      .replace("999Z", "999999Z"),
  });
  expect(
    createdSelection("custom", { start: "2026-08-01", end: "" }),
  ).toMatchObject({ gte: new Date(2026, 7, 1).toISOString(), lte: undefined });
  expect(createdSelection("all")).toEqual({ key: "all", gte: undefined });
  const now = new Date(2026, 7, 2, 12).getTime();
  expect(createdGte("today", now)).toBe(new Date(2026, 7, 2).toISOString());
  expect(createdGte("1h", now)).toBe(new Date(now - 3600_000).toISOString());
});
it("does not commit an invalid or cancelled range draft", async () => {
  const changed = vi.fn();
  render(<CreatedFilter value="all" onChange={changed} />);
  fireEvent.click(screen.getByLabelText("Created filter"));
  fireEvent.click(await screen.findByRole("button", { name: "Custom range" }));
  fireEvent.change(screen.getByLabelText("Start", { exact: true }), {
    target: { value: "bad" },
  });
  expect(screen.getByRole("button", { name: "Apply" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(changed).not.toHaveBeenCalled();
});

it("round-trips valid ranges and rejects malformed URL selections", () => {
  for (const value of [
    null,
    "unknown",
    "custom",
    "~",
    "2026-02-30~",
    "2026-08-01~bad",
    "2026-08-01~2026-08-02~extra",
  ])
    expect(decodeCreatedFilter(value).key).toBe("all");
  for (const range of [
    { start: "2026-08-01", end: "" },
    { start: "", end: "2026-08-02" },
    { start: "2026-08-01", end: "2026-08-02" },
  ]) {
    expect(
      decodeCreatedFilter(encodeCreatedFilter("custom", range)).range,
    ).toEqual(range);
  }
  expect(encodeCreatedFilter("all")).toBeNull();
  expect(encodeCreatedFilter("custom")).toBeNull();
  expect(encodeCreatedFilter("custom", { start: "", end: "" })).toBeNull();
  expect(encodeCreatedFilter("7d")).toBe("7d");
  expect(decodeCreatedFilter("7d").gte).toBeDefined();
});
it("applies a one-sided custom range and allows clearing both bounds", async () => {
  const changed = vi.fn();
  const view = render(
    <CreatedFilter
      value="custom"
      range={{ start: "2026-08-01", end: "" }}
      onChange={changed}
    />,
  );
  expect(screen.getByLabelText("Created filter")).toHaveTextContent(
    "After Aug 1, 2026",
  );
  fireEvent.click(screen.getByLabelText("Created filter"));
  fireEvent.change(await screen.findByLabelText("End", { exact: true }), {
    target: { value: "2026-08-02" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Apply" }));
  expect(changed).toHaveBeenLastCalledWith("custom", {
    start: "2026-08-01",
    end: "2026-08-02",
  });
  view.rerender(
    <CreatedFilter
      value="custom"
      range={{ start: "", end: "2026-08-02" }}
      onChange={changed}
    />,
  );
  expect(screen.getByLabelText("Created filter")).toHaveTextContent(
    "Before Aug 2, 2026",
  );
  fireEvent.click(screen.getByLabelText("Created filter"));
  fireEvent.change(await screen.findByLabelText("End", { exact: true }), {
    target: { value: "" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Apply" }));
  expect(changed).toHaveBeenLastCalledWith("all", { start: "", end: "" });
});
