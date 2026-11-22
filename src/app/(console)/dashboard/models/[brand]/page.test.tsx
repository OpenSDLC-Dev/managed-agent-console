import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { dashboardModels } from "@/components/console/dashboard-model-catalog";
import DashboardModelPage from "./page";

afterEach(cleanup);

it.each(dashboardModels)(
  "shows the upstream specifications with the $name integration",
  async (model) => {
    render(
      await DashboardModelPage({
        params: Promise.resolve({ brand: model.brand }),
      }),
    );
    expect(
      screen.getByRole("heading", { level: 1, name: model.name }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(
      screen.getByRole("region", { name: "Current deployment" }),
    ).toHaveTextContent(
      "Access to provider configuration could not be verified.",
    );
    expect(model.upstreamIds).toContain(model.id);
    const specs = within(
      screen.getByRole("region", { name: "Upstream specifications" }),
    );
    expect(specs.getByText(model.inputs)).toBeVisible();
    expect(
      specs.getByRole("button", { name: `Copy ${model.id}` }),
    ).toBeVisible();
    expect(
      specs.getByRole("link", { name: "Provider specifications" }),
    ).toHaveAttribute("href", model.docs);
    const prices = within(
      screen.getByRole("region", { name: "Deployment pricing" }),
    );
    expect(prices.getByRole("status")).toHaveTextContent(
      "Access to provider configuration could not be verified.",
    );
    expect(
      prices.getByRole("link", { name: "Provider price list" }),
    ).toHaveAttribute("href", model.providerPricingUrl);
    expect(screen.getByRole("link", { current: "page" })).toHaveTextContent(
      model.name,
    );
  },
);

it("returns the Next.js not-found result for an unknown model guide", async () => {
  await expect(
    DashboardModelPage({ params: Promise.resolve({ brand: "unknown" }) }),
  ).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
});
