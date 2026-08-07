import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(cleanup);
import userEvent from "@testing-library/user-event";
import { Pager } from "./pager";

describe("Pager", () => {
  it("fires the matching callback for each enabled button", async () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    render(<Pager hasPrev hasNext onPrev={onPrev} onNext={onNext} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Previous page" }),
    );
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onNext).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("disables both buttons at the boundaries and swallows clicks", async () => {
    const onPrev = vi.fn();
    const onNext = vi.fn();
    render(
      <Pager hasPrev={false} hasNext={false} onPrev={onPrev} onNext={onNext} />,
    );

    const prev = screen.getByRole("button", { name: "Previous page" });
    const next = screen.getByRole("button", { name: "Next page" });
    expect(prev).toBeDisabled();
    expect(next).toBeDisabled();

    await userEvent.click(prev).catch(() => {});
    await userEvent.click(next).catch(() => {});
    expect(onPrev).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });

  it("states its cursor position machine-readably", () => {
    // Disabled buttons imply the same thing, but only by inference from a
    // control's enabled-ness (CLAUDE.md's data-* convention).
    const noop = () => {};
    const { rerender } = render(
      <Pager hasPrev={false} hasNext onPrev={noop} onNext={noop} />,
    );
    expect(screen.getByTestId("pager")).toHaveAttribute(
      "data-has-prev",
      "false",
    );
    expect(screen.getByTestId("pager")).toHaveAttribute(
      "data-has-next",
      "true",
    );

    rerender(<Pager hasPrev hasNext={false} onPrev={noop} onNext={noop} />);
    expect(screen.getByTestId("pager")).toHaveAttribute(
      "data-has-prev",
      "true",
    );
    expect(screen.getByTestId("pager")).toHaveAttribute(
      "data-has-next",
      "false",
    );
  });
});
