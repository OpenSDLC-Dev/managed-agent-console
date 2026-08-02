import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { Nav } from "./nav";

const navState = vi.hoisted(() => ({ pathname: "/" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navState.pathname,
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: ComponentProps<"a">) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const EXPECTED = [
  { label: "Agents", href: "/agents" },
  { label: "Sessions", href: "/sessions" },
  { label: "Environments", href: "/environments" },
  { label: "Credential vaults", href: "/vaults" },
  { label: "Skills", href: "/skills" },
  { label: "Files", href: "/files" },
];

afterEach(() => {
  cleanup();
});

describe("Nav", () => {
  it("renders the section header and every item with its href", () => {
    navState.pathname = "/";
    render(<Nav />);
    expect(screen.getByText("Managed Agents")).toBeDefined();
    for (const { label, href } of EXPECTED) {
      expect(
        screen.getByRole("link", { name: label }).getAttribute("href"),
      ).toBe(href);
    }
  });

  it("marks the exact-match route active and leaves the rest inactive", () => {
    navState.pathname = "/agents";
    render(<Nav />);
    const active = screen.getByRole("link", { name: "Agents" });
    expect(active.classList.contains("bg-sidebar-accent")).toBe(true);
    expect(active.classList.contains("font-medium")).toBe(true);
    for (const { label } of EXPECTED.slice(1)) {
      const link = screen.getByRole("link", { name: label });
      expect(link.classList.contains("bg-sidebar-accent")).toBe(false);
    }
  });

  it("marks a nested route active via the prefix match", () => {
    navState.pathname = "/sessions/sess_01/trace";
    render(<Nav />);
    const sessions = screen.getByRole("link", { name: "Sessions" });
    expect(sessions.classList.contains("bg-sidebar-accent")).toBe(true);
    const agents = screen.getByRole("link", { name: "Agents" });
    expect(agents.classList.contains("bg-sidebar-accent")).toBe(false);
  });

  it("activates nothing on an unrelated route", () => {
    navState.pathname = "/settings";
    render(<Nav />);
    for (const { label } of EXPECTED) {
      const link = screen.getByRole("link", { name: label });
      expect(link.classList.contains("bg-sidebar-accent")).toBe(false);
    }
  });
});
