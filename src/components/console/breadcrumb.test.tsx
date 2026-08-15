import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { Breadcrumb } from "./breadcrumb";

afterEach(cleanup);

describe("Breadcrumb", () => {
  it("links the parent and names the current page", () => {
    render(
      <Breadcrumb
        parent={{ href: "/environments", label: "Environments" }}
        current="self-hosted-test-env"
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(nav).toBeInTheDocument();
    const parent = screen.getByRole("link", { name: "Environments" });
    expect(parent).toHaveAttribute("href", "/environments");
    expect(screen.getByText("self-hosted-test-env")).toBeInTheDocument();
  });
});
