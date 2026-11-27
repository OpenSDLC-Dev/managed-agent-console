"use client";

import Image from "next/image";
import Link from "@/components/shell/workspace-navigation";
import { useId, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CopyIdButton } from "./copy-id";
import { DashboardModelPopup } from "./dashboard-model-popup";
import { DashboardModelPrices } from "./dashboard-model-gateway";
import {
  dashboardModelPath,
  dashboardModels,
  modelFeatures,
  type DashboardModel,
} from "./dashboard-model-catalog";
import { PlaygroundViewSwitch } from "./playground-view-switch";

const linkStyle =
  "rounded-sm text-[#355984] underline decoration-current/35 underline-offset-3 hover:decoration-current focus-visible:outline-2 focus-visible:outline-ring dark:text-[#a0bee6]";
const sections = ["Cost", "Features"] as const;
type ComparisonView = (typeof sections)[number];

function ModelCard({ model }: { model: DashboardModel }) {
  const headingId = useId();
  const trigger = useRef<HTMLAnchorElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <article
        aria-labelledby={headingId}
        data-dashboard-model={model.id}
        className="group relative isolate flex min-h-[191px] min-w-0 flex-col overflow-hidden rounded-xl bg-foreground/[0.035] outline-offset-2 transition-colors hover:bg-foreground/[0.06] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring dark:bg-card dark:hover:bg-secondary"
      >
        <div
          className={cn(
            "grid h-[90px] shrink-0 place-items-center",
            model.band,
          )}
        >
          <Image
            src={`/brands/${model.brand}.svg`}
            width={60}
            height={56}
            alt=""
            unoptimized
            className="h-14 w-[60px] object-contain"
          />
        </div>
        <div className="px-4 py-3">
          <h3
            id={headingId}
            className="text-sm font-medium leading-5 group-hover:underline"
          >
            <a
              ref={trigger}
              href={dashboardModelPath(model)}
              target="_blank"
              rel="noreferrer"
              aria-haspopup="dialog"
              aria-expanded={open}
              onClick={(event) => {
                if (
                  event.button !== 0 ||
                  event.metaKey ||
                  event.ctrlKey ||
                  event.shiftKey ||
                  event.altKey
                )
                  return;
                event.preventDefault();
                setOpen(true);
              }}
              className="after:absolute after:inset-0 focus-visible:outline-none"
            >
              {model.name}
            </a>
          </h3>
          <p className="mt-1 text-xs leading-4 text-muted-foreground">
            {model.description}
          </p>
          <ul className="mt-2 flex flex-wrap gap-1">
            {[`${model.contextWindow} context`, ...model.tags].map((tag) => (
              <li
                key={tag}
                className="rounded-full bg-foreground/[0.055] px-2 py-0.5 text-xs leading-4 text-muted-foreground dark:bg-secondary"
              >
                {tag}
              </li>
            ))}
          </ul>
        </div>
      </article>
      <DashboardModelPopup model={model} finalFocus={trigger} />
    </Dialog>
  );
}

function ComparisonColumn({
  initial,
  position,
  view,
}: {
  initial: DashboardModel;
  position: number;
  view: ComparisonView;
}) {
  const [model, setModel] = useState(initial);

  return (
    <section
      aria-label={`Comparison column ${position}`}
      data-upstream-model={model.id}
      className="flex min-w-0 flex-col border-r px-3 first:pl-0 last:border-r-0 last:pr-0"
    >
      <Select
        value={model}
        itemToStringLabel={(item) => item.name}
        itemToStringValue={(item) => item.id}
        onValueChange={(item) => {
          if (item) setModel(item);
        }}
      >
        <SelectTrigger
          aria-label={`Model ${position}`}
          className="w-full border-transparent bg-muted px-3 data-[size=default]:h-10"
        >
          <SelectValue>{model.name}</SelectValue>
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          {dashboardModels.map((item) => (
            <SelectItem key={item.id} value={item}>
              {item.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="my-3 min-h-10 text-sm leading-5 text-muted-foreground">
        {model.description}
      </p>
      {view === "Cost" ? (
        <div className="space-y-4 text-sm">
          <DashboardModelPrices model={model} layout="comparison" />
          <Link
            className={linkStyle}
            href={`${dashboardModelPath(model)}#pricing`}
            aria-label={`View pricing for ${model.name}`}
          >
            View pricing
          </Link>
        </div>
      ) : (
        <>
          <dl className="text-sm text-muted-foreground">
            {modelFeatures(model).map(([label, value]) => (
              <div
                key={label}
                className="flex min-h-[53px] items-center justify-between gap-2 border-t py-2.5"
              >
                <dt>{label}</dt>
                <dd className="text-right">{value}</dd>
              </div>
            ))}
          </dl>
          <div className="space-y-2 border-t pt-4 text-sm">
            <h3 className="text-muted-foreground">Upstream model ID</h3>
            <div className="flex items-center gap-1">
              <code className="select-all break-all text-xs">{model.id}</code>
              <CopyIdButton key={model.id} id={model.id} />
            </div>
            <Link
              className={linkStyle}
              href={dashboardModelPath(model)}
              aria-label={`Model documentation for ${model.name}`}
            >
              Model documentation
            </Link>
          </div>
        </>
      )}
    </section>
  );
}

function Comparison() {
  const [view, setView] = useState<ComparisonView>("Cost");
  return (
    <>
      <DialogTitle className="pr-8 text-base">Compare models</DialogTitle>
      <div className="mt-4">
        <PlaygroundViewSwitch
          label="Compare by"
          value={view}
          options={sections}
          onChange={setView}
        />
      </div>
      <div
        role="region"
        aria-label="Model comparison"
        tabIndex={0}
        className="mt-7 min-h-0 flex-1 overflow-auto overscroll-contain rounded-sm focus-visible:outline-2 focus-visible:outline-ring"
      >
        <div className="grid min-w-[610px] grid-cols-3">
          {dashboardModels.slice(0, 3).map((initial, index) => (
            <ComparisonColumn
              key={initial.id}
              initial={initial}
              position={index + 1}
              view={view}
            />
          ))}
        </div>
      </div>
      <DialogDescription className="mt-4 text-xs leading-4">
        {view === "Cost"
          ? "Prices per million tokens from your upstream deployments."
          : "Provider model specifications. Use a configured gateway alias for API requests."}
      </DialogDescription>
    </>
  );
}

export function DashboardModels() {
  const popupRef = useRef<HTMLDivElement>(null);
  return (
    <section aria-label="Models">
      <header className="mb-3 flex items-center justify-between gap-3 px-1">
        <h2 className="text-[15px] font-semibold leading-5">Models</h2>
        <Dialog>
          <DialogTrigger className={cn(linkStyle, "text-sm leading-5")}>
            Compare models
          </DialogTrigger>
          <DialogPortal>
            <DialogOverlay className="bg-black/40 supports-backdrop-filter:backdrop-blur-none" />
          </DialogPortal>
          <DialogContent
            ref={popupRef}
            showOverlay={false}
            initialFocus={() =>
              popupRef.current?.querySelector<HTMLButtonElement>(
                '[data-slot="dialog-close"]',
              )
            }
            className="flex h-[min(574px,calc(100dvh-2rem))] w-[calc(100%-2rem)] flex-col gap-0 rounded-2xl shadow-lg sm:max-w-[720px]"
          >
            <Comparison />
          </DialogContent>
        </Dialog>
      </header>
      <div className="grid grid-cols-1 gap-3 @min-[25rem]:grid-cols-2 @min-[45rem]:grid-cols-4">
        {dashboardModels.map((model) => (
          <ModelCard key={model.id} model={model} />
        ))}
      </div>
    </section>
  );
}
