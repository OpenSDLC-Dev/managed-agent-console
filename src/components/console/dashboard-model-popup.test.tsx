import "@testing-library/jest-dom/vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { afterEach, expect, it, vi } from "vitest";
import { TEST_SESSION } from "@/../test/session-fixture";
import {
  ConsoleSessionContext,
  type useConsoleSession,
} from "@/components/shell/console-session";
import { Dialog } from "@/components/ui/dialog";
import { copyText } from "@/lib/copy-text";
import {
  dashboardModelPath,
  dashboardModels,
  type DashboardModel,
} from "./dashboard-model-catalog";
import { DashboardModelPopup } from "./dashboard-model-popup";

vi.mock("@/lib/copy-text", () => ({ copyText: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function ModelCard({ model }: { model: DashboardModel }) {
  const [open, setOpen] = useState(false);
  const card = useRef<HTMLAnchorElement>(null);
  return (
    <>
      <a
        ref={card}
        href={dashboardModelPath(model)}
        onClick={(event) => {
          event.preventDefault();
          setOpen(true);
        }}
      >
        {model.name}
      </a>
      <Dialog open={open} onOpenChange={setOpen}>
        <DashboardModelPopup model={model} finalFocus={card} />
      </Dialog>
    </>
  );
}

async function openPopup(model: DashboardModel) {
  const user = userEvent.setup();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ConsoleSessionContext.Provider
        value={
          {
            data: { ...TEST_SESSION, role: "user", playground_access: false },
          } as ReturnType<typeof useConsoleSession>
        }
      >
        <ModelCard model={model} />
      </ConsoleSessionContext.Provider>
    </QueryClientProvider>,
  );
  const card = screen.getByRole("link", { name: model.name });
  await user.click(card);
  const dialog = await screen.findByRole("dialog", { name: model.name });
  return { user, card, dialog };
}

it.each(dashboardModels)(
  "shows public facts, units, and the brand mark for $name",
  async (model) => {
    const { dialog } = await openPopup(model);
    const popup = within(dialog);
    expect(dialog).toHaveAccessibleDescription(model.description);
    expect(dialog.querySelector("img")).toHaveAttribute(
      "src",
      `/brands/${model.brand}.svg`,
    );
    const cost = popup.getByRole("region", { name: "Cost" });
    expect(
      within(cost).getByText(`${model.pricing.uncachedInput} / MTok`),
    ).toBeVisible();
    expect(
      within(cost).getByText(`${model.pricing.output} / MTok`),
    ).toBeVisible();
    expect(
      within(cost).getByText(`${model.pricing.cachedInput} / MTok`),
    ).toBeVisible();
    expect(
      popup.getByText(model.pricing.terms, { exact: false }),
    ).toBeVisible();
    const features = popup.getByRole("region", { name: "Features" });
    expect(
      within(features).getByText(`${model.contextWindow} tokens`),
    ).toBeVisible();
    expect(within(features).getByText(model.maxOutput)).toBeVisible();
    expect(within(features).getByText(model.inputs)).toBeVisible();
    expect(within(features).getByText(model.reasoning)).toBeVisible();
    if (model.brand === "kimi") {
      expect(
        within(cost).getByText("Write (5 min)").parentElement,
      ).toHaveTextContent("$3 / MTok");
      expect(
        within(cost).getByText("Write (1 hr)").parentElement,
      ).toHaveTextContent("$6 / MTok");
    } else {
      expect(within(cost).getByText("Write").parentElement).toHaveTextContent(
        "Not separately listed",
      );
    }
    expect(
      popup.getByRole("link", { name: "View full pricing" }),
    ).toHaveAttribute("href", `${dashboardModelPath(model)}#pricing`);
  },
);

it("can copy the upstream ID and open the model guide without a gateway alias", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  vi.mocked(copyText).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  const model = dashboardModels.find((entry) => entry.brand === "minimax")!;
  const { dialog, user } = await openPopup(model);
  const popup = within(dialog);
  const copy = popup.getByRole("button", { name: "Copy model ID MiniMax-M3" });
  await user.click(within(copy).getByText("MiniMax-M3"));
  expect(copyText).toHaveBeenCalledWith("MiniMax-M3");
  expect(toast.success).toHaveBeenCalledWith("Model ID copied.");
  await user.click(copy);
  expect(toast.error).toHaveBeenCalledWith("Could not copy the model ID.");
  expect(popup.queryByRole("link", { name: "Try in playground" })).toBeNull();
  await user.click(popup.getByRole("button", { name: "More options" }));
  expect(
    await screen.findByRole("menuitem", { name: "View model guide" }),
  ).toHaveAttribute("href", "/dashboard/models/minimax");
  expect(screen.queryByRole("menuitem", { name: "Build an agent" })).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});

it("focuses Close on open and returns focus to the model card on close or Escape", async () => {
  const model = dashboardModels[0];
  const { user, card, dialog } = await openPopup(model);
  const close = within(dialog).getByRole("button", { name: "Close" });
  await waitFor(() => expect(close).toHaveFocus());
  await user.click(close);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(card).toHaveFocus();
  await user.keyboard("{Enter}");
  await screen.findByRole("dialog", { name: model.name });
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(card).toHaveFocus();
});
