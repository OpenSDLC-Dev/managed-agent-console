import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConsoleShell } from "./console-shell";

vi.mock("./nav", () => ({
  Nav: ({ compact, onExpand }: { compact: boolean; onExpand: () => void }) =>
    compact ? (
      <button onClick={onExpand}>Open group</button>
    ) : (
      <a href="#files">Files</a>
    ),
}));
vi.mock("./command-palette", () => ({
  CommandPalette: () => <button>Search</button>,
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderShell(narrow: boolean) {
  vi.stubGlobal("matchMedia", () => ({
    matches: narrow,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  return render(
    <ConsoleShell footer={<span>Account</span>}>
      <h1>Dashboard</h1>
    </ConsoleShell>,
  );
}

it("collapses, reopens groups and returns focus on Escape", async () => {
  const user = userEvent.setup();
  renderShell(false);
  await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));
  expect(screen.getByText("Account")).not.toBeVisible();
  await user.click(screen.getByRole("button", { name: "Open group" }));
  expect(screen.getByText("Account")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));
  await user.click(screen.getByRole("button", { name: "Expand sidebar" }));
  await user.keyboard("{Escape}");
  expect(screen.getByRole("button", { name: "Expand sidebar" })).toHaveFocus();
});

it("starts compact on narrow screens and closes after navigation", async () => {
  const user = userEvent.setup();
  renderShell(true);
  await user.click(screen.getByRole("button", { name: "Expand sidebar" }));
  expect(screen.getByText("Dashboard")).not.toBeVisible();
  await user.click(screen.getByRole("link", { name: "Files" }));
  expect(screen.getByText("Dashboard")).toBeVisible();
  expect(screen.getByRole("button", { name: "Expand sidebar" })).toHaveFocus();
});
