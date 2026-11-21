import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ConsoleShell } from "./console-shell";

vi.mock("./nav", () => ({
  Nav: () => <a href="#files">Files</a>,
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

it("keeps desktop navigation open even with a saved collapsed preference", async () => {
  localStorage.setItem("managed-agent-console:nav:sidebar", "false");
  renderShell(false);
  const files = screen.getByRole("link", { name: "Files" });
  files.focus();
  await userEvent.keyboard("{Escape}");
  expect(files).toHaveFocus();
  expect(screen.getByText("Account")).toBeVisible();
  expect(screen.getByRole("banner")).toContainElement(
    screen.getByRole("link", { name: "Platform documentation" }),
  );
  expect(
    screen.queryByRole("button", {
      name: /collapse sidebar|expand sidebar|^menu$/i,
    }),
  ).toBeNull();
});

it("opens the header menu on narrow screens and closes after navigation", async () => {
  const user = userEvent.setup();
  renderShell(true);
  await user.click(screen.getByRole("button", { name: "Menu" }));
  expect(screen.getByText("Dashboard").closest("main")).toHaveAttribute(
    "inert",
  );
  await user.click(screen.getByRole("link", { name: "Files" }));
  expect(screen.getByText("Dashboard")).toBeVisible();
  expect(screen.getByRole("button", { name: "Menu" })).toHaveFocus();
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
  act(() => {
    narrow = true;
    listeners.forEach((listener) => listener());
  });
  await user.click(screen.getByRole("button", { name: "Menu" }));
  expect(screen.getByText("Dashboard").closest("main")).toHaveAttribute(
    "inert",
  );
  act(() => {
    narrow = false;
    listeners.forEach((listener) => listener());
  });
  expect(screen.getByRole("link", { name: "Files" })).toBeVisible();
  expect(screen.queryByRole("button", { name: "Close menu" })).toBeNull();
  act(() => {
    narrow = true;
    listeners.forEach((listener) => listener());
  });
  expect(screen.getByText("Dashboard")).toBeVisible();
});
