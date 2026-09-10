import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SkillInspector } from "./skill-inspector";

vi.mock("./skill-detail", () => ({
  SkillDetail: ({ id }: { id: string }) => <h2>{id}</h2>,
}));
afterEach(cleanup);

it("focuses the non-modal inspector and restores the connected trigger", () => {
  const trigger = document.createElement("button");
  document.body.append(trigger);
  trigger.focus();
  const close = vi.fn();
  const { unmount } = render(
    <SkillInspector id="xlsx" onClose={close} onSelect={vi.fn()} />,
  );
  const panel = screen.getByRole("region", { name: "Skill details" });
  expect(panel).toHaveFocus();
  fireEvent.keyDown(panel, { key: "Escape" });
  expect(close).toHaveBeenCalledOnce();
  unmount();
  expect(trigger).toHaveFocus();
  trigger.remove();
});

it("navigates only to available neighbors and closes explicitly", async () => {
  const select = vi.fn(),
    close = vi.fn();
  const { rerender } = render(
    <SkillInspector id="xlsx" next="pdf" onClose={close} onSelect={select} />,
  );
  expect(screen.getByRole("button", { name: "Previous skill" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Next skill" }));
  expect(select).toHaveBeenLastCalledWith("pdf");
  rerender(
    <SkillInspector
      id="pdf"
      previous="xlsx"
      onClose={close}
      onSelect={select}
    />,
  );
  expect(screen.getByRole("button", { name: "Next skill" })).toBeDisabled();
  await userEvent.click(screen.getByRole("button", { name: "Previous skill" }));
  expect(select).toHaveBeenLastCalledWith("xlsx");
  await userEvent.click(screen.getByRole("button", { name: "Close details" }));
  expect(close).toHaveBeenCalledOnce();
});

it("resizes by keyboard within bounds and resets with Home or double click", () => {
  render(<SkillInspector id="xlsx" onClose={vi.fn()} onSelect={vi.fn()} />);
  const handle = screen.getByRole("separator", { name: "Resize panel" });
  fireEvent.keyDown(handle, { key: "ArrowLeft" });
  expect(handle).toHaveAttribute("aria-valuenow", "592");
  for (let i = 0; i < 20; i++) fireEvent.keyDown(handle, { key: "ArrowRight" });
  expect(handle).toHaveAttribute("aria-valuenow", "320");
  fireEvent.keyDown(handle, { key: "Home" });
  expect(handle).toHaveAttribute("aria-valuenow", "560");
  fireEvent.keyDown(handle, { key: "ArrowRight" });
  fireEvent.doubleClick(handle);
  expect(handle).toHaveAttribute("aria-valuenow", "560");
});
