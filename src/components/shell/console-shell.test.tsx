import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConsoleShell } from "./console-shell";

vi.mock("./nav", () => ({
  Nav: ({ compact }: { compact: boolean }) =>
    compact ? null : <a href="#files">Files</a>,
}));
vi.mock("./command-palette", () => ({
  CommandPalette: () => <button>Search</button>,
}));
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
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

it("collapses, reopens and returns focus on Escape", async () => {
  const user = userEvent.setup();
  renderShell(false);
  await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));
  expect(screen.getByText("Account")).not.toBeVisible();
  await user.click(screen.getByRole("button", { name: "Expand sidebar" }));
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

it("restores desktop preference after remount without opening mobile navigation", async () => {
  const user = userEvent.setup();
  let view = renderShell(false);
  await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));
  view.unmount();
  view = renderShell(false);
  expect(
    screen.getByRole("button", { name: "Expand sidebar" }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Expand sidebar" }));
  view.unmount();
  renderShell(true);
  expect(
    screen.getByRole("button", { name: "Expand sidebar" }),
  ).toBeInTheDocument();
  expect(localStorage.getItem("managed-agent-console:nav:sidebar")).toBe(
    "true",
  );
});

it("resets temporary mobile expansion across viewport transitions", async () => {
  const user = userEvent.setup();
  let narrow = false;
  const listeners = new Set<() => void>();
  vi.stubGlobal("matchMedia", () => ({
    matches: narrow,
    addEventListener: (_: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) =>
      listeners.delete(listener),
  }));
  render(
    <ConsoleShell footer={null}>
      <h1>Dashboard</h1>
    </ConsoleShell>,
  );
  await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));
  act(() => {
    narrow = true;
    listeners.forEach((listener) => listener());
  });
  await user.click(screen.getByRole("button", { name: "Expand sidebar" }));
  expect(screen.getByText("Dashboard")).not.toBeVisible();
  act(() => {
    narrow = false;
    listeners.forEach((listener) => listener());
  });
  expect(
    screen.getByRole("button", { name: "Expand sidebar" }),
  ).toBeInTheDocument();
  act(() => {
    narrow = true;
    listeners.forEach((listener) => listener());
  });
  expect(screen.getByText("Dashboard")).toBeVisible();
});

it("keeps navigation usable when browser storage is blocked", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("blocked");
  });
  const user = userEvent.setup();
  renderShell(false);
  await user.click(screen.getByRole("button", { name: "Collapse sidebar" }));
  await user.click(screen.getByRole("button", { name: "Expand sidebar" }));
  expect(screen.getByText("Account")).toBeVisible();
});

it("updates the sidebar when another tab changes its preference", () => {
  renderShell(false);
  act(() => {
    localStorage.setItem("managed-agent-console:nav:sidebar", "false");
    window.dispatchEvent(new StorageEvent("storage"));
  });
  expect(
    screen.getByRole("button", { name: "Expand sidebar" }),
  ).toBeInTheDocument();
});
