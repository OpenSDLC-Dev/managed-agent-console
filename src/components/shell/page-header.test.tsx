import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { PageHeader } from "./page-header";

afterEach(() => {
  cleanup();
});

describe("PageHeader", () => {
  it("renders the title as the page heading", () => {
    render(<PageHeader title="Agents" />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Agents" }),
    ).toBeDefined();
  });

  it("omits subtitle and actions when not provided", () => {
    const { container } = render(<PageHeader title="Agents" />);
    expect(container.querySelector("p")).toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });

  it("renders the subtitle when provided", () => {
    render(<PageHeader title="Agents" subtitle="Reusable agent definitions" />);
    expect(screen.getByText("Reusable agent definitions")).toBeDefined();
  });

  it("renders the actions node when provided", () => {
    render(
      <PageHeader
        title="Agents"
        actions={<button type="button">New agent</button>}
      />,
    );
    expect(screen.getByRole("button", { name: "New agent" })).toBeDefined();
  });
});
