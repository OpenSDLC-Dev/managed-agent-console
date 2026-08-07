import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import pkg from "../../../package.json";
import { ConsoleVersion } from "./version";

afterEach(() => {
  cleanup();
});

describe("ConsoleVersion", () => {
  // Both sides read package.json on purpose. The failure this guards is not a
  // wrong string but a disconnected one: the version release-please bumps has
  // to be the version an operator reads off the sidebar, so a hardcoded literal
  // or a second source of truth reddens here.
  it("renders the version package.json declares", () => {
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+$/);

    render(<ConsoleVersion />);

    expect(screen.getByText(`v${pkg.version}`)).toBeInTheDocument();
  });

  it("carries the raw version as a data attribute", () => {
    const { container } = render(<ConsoleVersion />);

    expect(container.querySelector("[data-console-version]")).toHaveAttribute(
      "data-console-version",
      pkg.version,
    );
  });
});
