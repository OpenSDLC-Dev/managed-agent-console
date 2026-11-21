import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BuildVersions } from "./version";

afterEach(cleanup);

it.each([
  ["1.2.3", "v1.2.3"],
  ["v1.2.3", "v1.2.3"],
  ["1.2.4-rc.1", "v1.2.4-rc.1"],
  ["dev-123abcd", "dev-123abcd"],
  ["514bf0b9", "514bf0b9"],
  [undefined, "version unavailable"],
])(
  "shows the running Platform build %s above the independent Console release",
  (stamp, label) => {
    render(<BuildVersions platformVersion={stamp} consoleVersion="9.8.7" />);
    const platform = screen.getByText(`Platform ${label}`);
    const consoleBuild = screen.getByText("Console v9.8.7");
    expect(platform.nextElementSibling).toBe(consoleBuild);
    expect(consoleBuild).toHaveAttribute("data-console-version", "9.8.7");
    expect(platform).toHaveAttribute("data-platform-version", stamp ?? "");
  },
);
