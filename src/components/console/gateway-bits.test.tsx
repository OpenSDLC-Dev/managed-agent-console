import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { EnabledBadge, vendorLabel } from "./gateway-bits";
import { gatewayFixtures } from "../../../test/mock-platform/gateway.mjs";
import type { GatewayProfile, GatewayProvider } from "@/lib/platform/types";

const { profiles, providers } = gatewayFixtures() as {
  profiles: GatewayProfile[];
  providers: GatewayProvider[];
};
const provider = (id: string) => providers.find((p) => p.id === id)!;

afterEach(cleanup);

describe("vendorLabel", () => {
  it("names a two-site vendor's site from the endpoint it calls", () => {
    expect(vendorLabel(provider("gwprov_minimaxcn1"), profiles)).toBe(
      "MiniMax · China",
    );
  });

  it("names a single-site vendor alone", () => {
    expect(vendorLabel(provider("gwprov_deepseek01"), profiles)).toBe(
      "DeepSeek",
    );
  });

  it("names no site for an endpoint the vendor does not publish", () => {
    const custom = {
      ...provider("gwprov_minimaxcn1"),
      endpoints: { anthropic: "https://proxy.example.com/minimax" },
    };
    expect(vendorLabel(custom, profiles)).toBe("MiniMax");
  });

  it("falls back to the wire name while the profiles are unread", () => {
    expect(vendorLabel(provider("gwprov_giteeai001"), undefined)).toBe("gitee");
  });
});

describe("EnabledBadge", () => {
  // The one assertion of its human strings (CLAUDE.md).
  it("reads enabled or disabled, with the state on data-enabled", () => {
    render(
      <>
        <EnabledBadge enabled />
        <EnabledBadge enabled={false} />
      </>,
    );
    expect(screen.getByText("enabled")).toHaveAttribute("data-enabled", "true");
    expect(screen.getByText("disabled")).toHaveAttribute(
      "data-enabled",
      "false",
    );
  });
});
