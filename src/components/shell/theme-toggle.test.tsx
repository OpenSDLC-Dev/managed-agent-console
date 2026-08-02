import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "./theme-toggle";

const themeState = vi.hoisted(() => ({
  theme: "light" as string | undefined,
  setTheme: vi.fn(),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: themeState.theme, setTheme: themeState.setTheme }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ThemeToggle", () => {
  it("renders the three options and presses only the stored theme", () => {
    themeState.theme = "light";
    render(<ThemeToggle />);
    expect(screen.getByRole("group", { name: "Color theme" })).toBeDefined();
    expect(
      screen
        .getByRole("button", { name: "Light theme" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      screen
        .getByRole("button", { name: "System theme" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      screen
        .getByRole("button", { name: "Dark theme" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("highlights the dark option when dark is stored", () => {
    themeState.theme = "dark";
    render(<ThemeToggle />);
    const dark = screen.getByRole("button", { name: "Dark theme" });
    expect(dark.getAttribute("aria-pressed")).toBe("true");
    expect(dark.classList.contains("bg-sidebar-accent")).toBe(true);
    expect(
      screen
        .getByRole("button", { name: "Light theme" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("stores the clicked theme", async () => {
    themeState.theme = "light";
    const user = userEvent.setup();
    render(<ThemeToggle />);
    await user.click(screen.getByRole("button", { name: "Dark theme" }));
    expect(themeState.setTheme).toHaveBeenCalledWith("dark");
    await user.click(screen.getByRole("button", { name: "System theme" }));
    expect(themeState.setTheme).toHaveBeenCalledWith("system");
  });

  it("renders neutral (nothing pressed) before mount on the server", () => {
    themeState.theme = "dark";
    const html = renderToString(<ThemeToggle />);
    expect(html).not.toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
  });
});
