import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { EnabledBadge, isPlainHttp, vendorLabel } from "./gateway-bits";
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

  // The add dialog edits each endpoint on its own, so one provider can call
  // both sites. A single site would misname half its routing.
  it("names no site when the endpoints call both", () => {
    const mixed = {
      ...provider("gwprov_minimaxcn1"),
      endpoints: {
        anthropic: "https://api.minimax.cn/anthropic",
        openai: "https://api.minimax.io/v1",
      },
    };
    expect(vendorLabel(mixed, profiles)).toBe("MiniMax");
  });

  it("names no site when one endpoint is published and another is custom", () => {
    const partly = {
      ...provider("gwprov_minimaxcn1"),
      endpoints: {
        anthropic: "https://api.minimax.cn/anthropic",
        openai: "https://proxy.example.com/v1",
      },
    };
    expect(vendorLabel(partly, profiles)).toBe("MiniMax");
  });

  it("falls back to the wire name while the profiles are unread", () => {
    expect(vendorLabel(provider("gwprov_giteeai001"), undefined)).toBe("gitee");
  });
});

describe("isPlainHttp", () => {
  // validate.go checkEndpoint parses the scheme case-insensitively but stores
  // the endpoint as typed, so an upper-case scheme reaches the console.
  it.each([
    ["http://vllm.models.svc:8000/v1", true],
    ["HTTP://vllm.models.svc:8000/v1", true],
    ["Http://vllm.models.svc:8000/v1", true],
    ["https://api.deepseek.com", false],
    ["HTTPS://api.deepseek.com", false],
  ])("%s → %s", (url, plain) => {
    expect(isPlainHttp(url)).toBe(plain);
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
