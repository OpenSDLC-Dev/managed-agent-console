import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { BuildVersions } from "./version";

afterEach(cleanup);

it.each([
  ["1.2.3", "v1.2.3"],
  ["v1.2.3", "v1.2.3"],
  ["v0.6.0-dev-41a8318b", "v0.6.0-dev-41a8318b"],
  ["1.2.4-rc.1", "v1.2.4-rc.1"],
  ["dev-123abcd", "dev-123abcd"],
  ["514bf0b9", "514bf0b9"],
  [undefined, "version unavailable"],
])(
  "shows the running Platform build %s above the independent Console release",
  (stamp, label) => {
    render(<BuildVersions platformVersion={stamp} consoleVersion="v9.8.7" />);
    const platform = screen.getByText(`Platform ${label}`);
    const consoleBuild = screen.getByText("Console v9.8.7");
    expect(platform.nextElementSibling).toBe(consoleBuild);
    expect(consoleBuild).toHaveAttribute("data-console-version", "v9.8.7");
    expect(platform).toHaveAttribute("data-platform-version", stamp ?? "");
  },
);

it.each([
  ["v0.9.1-dev-0f123abc", "v0.9.1-dev-0f123abc"],
  ["", "version unavailable"],
])("shows the Console build %s independently", (stamp, label) => {
  render(<BuildVersions platformVersion="v0.6.0" consoleVersion={stamp} />);
  expect(screen.getByText(`Console ${label}`)).toHaveAttribute(
    "data-console-version",
    stamp,
  );
});
