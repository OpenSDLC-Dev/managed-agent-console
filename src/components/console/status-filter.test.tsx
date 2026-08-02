import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

afterEach(cleanup);
import userEvent from "@testing-library/user-event";
import { StatusFilter } from "./status-filter";

// base-ui's portal-based Select is not reliably drivable in jsdom, so the
// vendored primitives are replaced with a minimal harness that surfaces the
// same value/onValueChange contract StatusFilter programs against.
vi.mock("@/components/ui/select", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  interface CtxShape {
    value: string;
    onValueChange: (value: string) => void;
  }
  const Ctx = React.createContext<CtxShape>({
    value: "",
    onValueChange: () => {},
  });
  return {
    Select: ({
      value,
      onValueChange,
      children,
    }: CtxShape & { children?: React.ReactNode }) =>
      React.createElement(
        Ctx.Provider,
        { value: { value, onValueChange } },
        children,
      ),
    SelectTrigger: (props: {
      children?: React.ReactNode;
      "aria-label"?: string;
    }) =>
      React.createElement(
        "button",
        { type: "button", "aria-label": props["aria-label"] },
        props.children,
      ),
    SelectValue: () => {
      const ctx = React.useContext(Ctx);
      return React.createElement(
        "span",
        { "data-testid": "select-value" },
        ctx.value,
      );
    },
    SelectContent: ({ children }: { children?: React.ReactNode }) =>
      React.createElement("div", null, children),
    SelectItem: ({
      value,
      children,
    }: {
      value: string;
      children?: React.ReactNode;
    }) => {
      const ctx = React.useContext(Ctx);
      return React.createElement(
        "button",
        { type: "button", onClick: () => ctx.onValueChange(value) },
        children,
      );
    },
  };
});

describe("StatusFilter", () => {
  it("selects Active when archived resources are excluded", () => {
    render(<StatusFilter includeArchived={false} onChange={vi.fn()} />);
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Status filter" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("select-value")).toHaveTextContent("active");
  });

  it("selects All when archived resources are included", () => {
    render(<StatusFilter includeArchived onChange={vi.fn()} />);
    expect(screen.getByTestId("select-value")).toHaveTextContent("all");
  });

  it("reports true when All is chosen", async () => {
    const onChange = vi.fn();
    render(<StatusFilter includeArchived={false} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "All" }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("reports false when Active is chosen", async () => {
    const onChange = vi.fn();
    render(<StatusFilter includeArchived onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Active" }));
    expect(onChange).toHaveBeenCalledWith(false);
  });
});
