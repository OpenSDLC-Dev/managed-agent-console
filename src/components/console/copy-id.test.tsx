import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { CopyIdButton, IdCell } from "./copy-id";
import { copyText } from "@/lib/copy-text";

vi.mock("@/lib/copy-text", () => ({ copyText: vi.fn() }));
const mockCopyText = vi.mocked(copyText);

afterEach(cleanup);

describe("CopyIdButton", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("copies the full id, not the shortened display", async () => {
    mockCopyText.mockResolvedValue(true);
    render(<CopyIdButton id="env_01PJanq5x55L1HHZjfcHcqRP" />);
    fireEvent.click(
      screen.getByRole("button", {
        name: "Copy env_01PJanq5x55L1HHZjfcHcqRP",
      }),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockCopyText).toHaveBeenCalledWith("env_01PJanq5x55L1HHZjfcHcqRP");
  });
});

describe("IdCell", () => {
  it("pairs the shortened id with a copy control", () => {
    render(<IdCell id="env_01PJanq5x55L1HHZjfcHcqRP" />);
    const cell = screen.getByTestId("id-cell");
    expect(cell).toHaveAttribute("data-id", "env_01PJanq5x55L1HHZjfcHcqRP");
    expect(screen.getByText("env_…fcHcqRP")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Copy env_01PJanq5x55L1HHZjfcHcqRP",
      }),
    ).toBeInTheDocument();
  });
});
