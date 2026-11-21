import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import pkg from "../../../package.json";
import { BuildVersions } from "./version";

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

it.each([
  ["1.2.3", "v1.2.3"],
  ["v1.2.4-rc.1", "v1.2.4-rc.1"],
  ["dev-123abcd", "dev-123abcd"],
  [undefined, "version unavailable"],
])(
  "shows the deployed Platform build %s above the Console release",
  (stamp, label) => {
    vi.stubEnv("PLATFORM_VERSION", stamp);
    render(<BuildVersions />);
    const platform = screen.getByText(`Platform ${label}`);
    const consoleBuild = screen.getByText(`Console v${pkg.version}`);
    expect(platform.nextElementSibling).toBe(consoleBuild);
    expect(consoleBuild).toHaveAttribute("data-console-version", pkg.version);
    expect(platform).toHaveAttribute("data-platform-version", stamp ?? "");
  },
);
