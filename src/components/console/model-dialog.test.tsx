import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ModelDialog } from "./model-dialog";
import {
  gatewayFixtures,
  resetGateway,
} from "../../../test/mock-platform/gateway.mjs";
import {
  sentBody,
  stubGatewayFetch,
} from "../../../test/mock-platform/gateway-fetch";
import type { GatewayAlias } from "@/lib/platform/types";

resetGateway();
const aliases = gatewayFixtures().aliases as GatewayAlias[];
const byName = (name: string) => aliases.find((a) => a.name === name)!;

function renderDialog(alias?: GatewayAlias) {
  const onClose = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ModelDialog alias={alias} onClose={onClose} />
    </QueryClientProvider>,
  );
  return onClose;
}

const target = (label: string) => screen.getByRole("combobox", { name: label });

/** The options a target's select offers, by deployment id. */
const offered = (select: HTMLElement) =>
  within(select)
    .getAllByRole("option")
    .map((o) => (o as HTMLOptionElement).value)
    .filter(Boolean);

const shares = () =>
  [...document.querySelectorAll("[role=dialog] [data-share]")].map((s) =>
    s.getAttribute("data-share"),
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ModelDialog", () => {
  it("adds a model whose tiers become priorities, splitting each by weight", async () => {
    const fetchMock = stubGatewayFetch();
    const onClose = renderDialog();
    await userEvent.type(screen.getByLabelText("Name"), "coder");
    await userEvent.type(screen.getByLabelText("Display name"), "Coder");

    // Only chat upstream models are offered for a chat model.
    await waitFor(() =>
      expect(offered(target("Primary upstream model 1"))).toEqual([
        "gwdep_dsflash01",
        "gwdep_dspro0001",
        "gwdep_mmm30001",
      ]),
    );
    await userEvent.selectOptions(
      target("Primary upstream model 1"),
      "gwdep_dspro0001",
    );
    const weight = screen.getByLabelText("Primary upstream model 1 weight");
    await userEvent.clear(weight);
    await userEvent.type(weight, "3");
    await userEvent.click(
      screen.getByRole("button", { name: "Add upstream model" }),
    );
    // A model already in the routing is not offered again.
    expect(offered(target("Primary upstream model 2"))).not.toContain(
      "gwdep_dspro0001",
    );
    await userEvent.selectOptions(
      target("Primary upstream model 2"),
      "gwdep_mmm30001",
    );
    expect(shares()).toEqual(["0.75", "0.25"]);

    await userEvent.click(
      screen.getByRole("button", { name: "Add fallback tier" }),
    );
    await userEvent.selectOptions(
      target("Fallback 1 upstream model 1"),
      "gwdep_dsflash01",
    );
    await userEvent.click(screen.getByRole("button", { name: "Add model" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(sentBody(fetchMock, "POST")).toEqual({
      name: "coder",
      display_name: "Coder",
      targets: [
        { deployment_id: "gwdep_dspro0001", priority: 0, weight: 3 },
        { deployment_id: "gwdep_mmm30001", priority: 0, weight: 1 },
        { deployment_id: "gwdep_dsflash01", priority: 1, weight: 1 },
      ],
    });
  });

  it("gives an embedding model one upstream model, with no weights or tiers", async () => {
    stubGatewayFetch();
    renderDialog();
    await userEvent.click(screen.getByRole("radio", { name: "embedding" }));
    await waitFor(() =>
      expect(offered(target("Primary upstream model 1"))).toEqual([
        "gwdep_qwemb0001",
      ]),
    );
    expect(screen.queryByLabelText(/weight$/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Add fallback tier" }),
    ).toBeNull();
  });

  it("sends only the display name when the routing did not change", async () => {
    const fetchMock = stubGatewayFetch();
    const onClose = renderDialog(byName("agent-default"));
    const display = screen.getByLabelText("Display name");
    await userEvent.clear(display);
    await userEvent.type(display, "Agents");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(sentBody(fetchMock, "POST")).toEqual({ display_name: "Agents" });
  });

  it("replaces the targets whole, and an emptied tier closes up", async () => {
    const fetchMock = stubGatewayFetch();
    const onClose = renderDialog(byName("agent-default"));
    expect(screen.queryByLabelText("Name")).toBeNull();
    await userEvent.click(
      screen.getByRole("button", {
        name: "Remove Fallback 1 upstream model 1",
      }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Remove Primary upstream model 2" }),
    );
    expect(
      document.querySelectorAll("[role=dialog] [data-priority]"),
    ).toHaveLength(1);
    // The last target left cannot be removed: a model needs one.
    expect(
      screen.getByRole("button", { name: "Remove Primary upstream model 1" }),
    ).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(sentBody(fetchMock, "POST")).toEqual({
      display_name: "Agent default",
      targets: [{ deployment_id: "gwdep_mmm30001", priority: 0, weight: 3 }],
    });
  });

  it("keeps an embedding model's upstream model fixed", async () => {
    const fetchMock = stubGatewayFetch();
    const onClose = renderDialog(byName("kb-embed"));
    expect(target("Primary upstream model 1")).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(sentBody(fetchMock, "POST")).toEqual({
      display_name: "KB embeddings",
    });
  });

  it("shows the gateway's refusal and stays open", async () => {
    stubGatewayFetch();
    const onClose = renderDialog();
    await userEvent.type(screen.getByLabelText("Name"), "agent-default");
    await waitFor(() =>
      expect(offered(target("Primary upstream model 1"))).not.toEqual([]),
    );
    await userEvent.selectOptions(
      target("Primary upstream model 1"),
      "gwdep_dsflash01",
    );
    await userEvent.click(screen.getByRole("button", { name: "Add model" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      'alias "agent-default" already exists',
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  // JSON writes Infinity as null, and a null weight is the gateway's default
  // of 1: "1e309" would quietly change the split.
  it("probe: sends nothing for a weight past what JSON holds", async () => {
    const fetchMock = stubGatewayFetch();
    const onClose = renderDialog();
    await userEvent.type(screen.getByLabelText("Name"), "coder");
    await waitFor(() =>
      expect(offered(target("Primary upstream model 1"))).not.toEqual([]),
    );
    await userEvent.selectOptions(
      target("Primary upstream model 1"),
      "gwdep_dsflash01",
    );
    const weight = screen.getByLabelText("Primary upstream model 1 weight");
    await userEvent.clear(weight);
    await userEvent.type(weight, "1e309");
    await userEvent.click(screen.getByRole("button", { name: "Add model" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("weight");
    expect(
      fetchMock.mock.calls.filter(([, i]) => i?.method === "POST"),
    ).toHaveLength(0);
    expect(onClose).not.toHaveBeenCalled();
  });
});
