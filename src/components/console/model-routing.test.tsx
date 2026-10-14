import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RoutesTo, RoutingTiers, tierLabel, tiers } from "./model-routing";
import {
  gatewayFixtures,
  resetGateway,
} from "../../../test/mock-platform/gateway.mjs";
import type {
  GatewayAlias,
  GatewayDeployment,
  GatewayProvider,
} from "@/lib/platform/types";

resetGateway();
const fixtures = gatewayFixtures();
const aliases = fixtures.aliases as GatewayAlias[];
const deployments = fixtures.deployments as GatewayDeployment[];
const providers = fixtures.providers as GatewayProvider[];
const AGENT_DEFAULT = aliases.find((a) => a.name === "agent-default")!;

afterEach(cleanup);

describe("tiers", () => {
  it("groups by priority, lowest first, and shares each tier by weight", () => {
    expect(
      tiers([
        { deployment_id: "c", priority: 7, weight: 1 },
        { deployment_id: "a", priority: 2, weight: 3 },
        { deployment_id: "b", priority: 2, weight: 1 },
      ]),
    ).toEqual([
      {
        priority: 2,
        targets: [
          { deployment_id: "a", weight: 3, share: 0.75 },
          { deployment_id: "b", weight: 1, share: 0.25 },
        ],
      },
      { priority: 7, targets: [{ deployment_id: "c", weight: 1, share: 1 }] },
    ]);
  });

  it("labels tiers by position, not by priority number", () => {
    expect([0, 1, 2].map(tierLabel)).toEqual([
      "Primary",
      "Fallback 1",
      "Fallback 2",
    ]);
  });
});

describe("RoutesTo", () => {
  // The one test that asserts the share formatter's string.
  it("names each tier's upstream models, with shares only where a tier splits", () => {
    const { container } = render(
      <RoutesTo alias={AGENT_DEFAULT} deployments={deployments} />,
    );
    expect(container).toHaveTextContent(
      "MiniMax-M3 75% · deepseek-v4-pro 25%then deepseek-v4-flash",
    );
    expect(container.querySelector("[data-tiers]")).toHaveAttribute(
      "data-tiers",
      "2",
    );
  });

  it("names a target by its id when the upstream model is gone", () => {
    render(
      <RoutesTo
        alias={{
          ...AGENT_DEFAULT,
          targets: [{ deployment_id: "gwdep_gone", priority: 0, weight: 1 }],
        }}
        deployments={deployments}
      />,
    );
    expect(screen.getByText("gwdep_gone")).toBeInTheDocument();
  });
});

describe("RoutingTiers", () => {
  it("shows each tier with its targets' providers and shares", () => {
    const { container } = render(
      <RoutingTiers
        alias={AGENT_DEFAULT}
        deployments={deployments}
        providers={providers}
      />,
    );
    const boxes = [...container.querySelectorAll("[data-priority]")];
    expect(boxes.map((b) => b.getAttribute("data-priority"))).toEqual([
      "0",
      "1",
    ]);
    expect(boxes[0]).toHaveTextContent("Primary");
    expect(boxes[0]).toHaveTextContent("on MiniMax CN");
    expect(
      [...boxes[0].querySelectorAll("[data-share]")].map((s) =>
        s.getAttribute("data-share"),
      ),
    ).toEqual(["0.75", "0.25"]);
    expect(boxes[1]).toHaveTextContent("Fallback 1");
  });
});
