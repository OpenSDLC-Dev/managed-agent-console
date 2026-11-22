"use client";

import { Copy } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRef, type RefObject } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { copyText } from "@/lib/copy-text";
import {
  dashboardModelPath,
  modelFeatures,
  type DashboardModel,
} from "./dashboard-model-catalog";
import {
  DashboardModelGateway,
  DashboardModelPrices,
} from "./dashboard-model-gateway";

function FactRows({ rows }: { rows: string[][] }) {
  return (
    <dl className="text-muted-foreground">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="flex min-h-[53px] items-center justify-between gap-3 border-t py-2.5 text-sm"
        >
          <dt>{label}</dt>
          <dd className="text-right tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DashboardModelPopup({
  model,
  finalFocus,
}: {
  model: DashboardModel;
  finalFocus?: RefObject<HTMLAnchorElement | null>;
}) {
  const popup = useRef<HTMLDivElement>(null);

  return (
    <>
      <DialogPortal>
        <DialogOverlay className="bg-black/40 supports-backdrop-filter:backdrop-blur-none" />
      </DialogPortal>
      <DialogContent
        ref={popup}
        showOverlay={false}
        initialFocus={() =>
          popup.current?.querySelector<HTMLButtonElement>(
            '[data-slot="dialog-close"]',
          )
        }
        finalFocus={finalFocus}
        className="flex h-[min(544px,calc(100dvh-2rem))] w-[calc(100%-2rem)] flex-col gap-0 rounded-2xl p-0 shadow-lg sm:max-w-[720px]"
      >
        <div
          role="region"
          aria-label="Model details"
          data-model-popup-scroll
          tabIndex={0}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain rounded-[inherit] p-4 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        >
          <div className="grid min-w-0 grid-cols-[3.5rem_minmax(0,1fr)] gap-x-3 gap-y-4 sm:grid-cols-[5rem_minmax(0,1fr)] sm:gap-x-5 sm:gap-y-6">
            <Image
              src={`/brands/${model.brand}.svg`}
              alt=""
              width={80}
              height={80}
              unoptimized
              className="size-14 self-center object-contain sm:row-span-2 sm:size-20"
            />
            <div className="min-w-0 pr-8">
              <DialogTitle className="text-sm leading-5">
                {model.name}
              </DialogTitle>
              <DialogDescription className="mt-3 text-sm leading-5">
                {model.description}
              </DialogDescription>
            </div>
            <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 sm:col-span-1">
              <DashboardModelGateway model={model} mode="popup" />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                aria-label={`Copy model ID ${model.id}`}
                title="Copy upstream model ID"
                className="max-w-full gap-1.5 px-2 font-normal"
                onClick={async () => {
                  if (await copyText(model.id))
                    toast.success("Model ID copied.");
                  else toast.error("Could not copy the model ID.");
                }}
              >
                <code className="truncate font-mono text-sm">{model.id}</code>
                <Copy aria-hidden className="size-3.5" />
              </Button>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-10">
            <section aria-label="Cost" className="min-w-0">
              <h3 className="pb-2.5 text-[13px] font-medium leading-5">Cost</h3>
              <DashboardModelPrices model={model} layout="popup" />
            </section>
            <section aria-label="Features" className="min-w-0">
              <h3 className="pb-2.5 text-[13px] font-medium leading-5">
                Features
              </h3>
              <FactRows rows={modelFeatures(model)} />
            </section>
          </div>
          <p className="mt-auto pt-5 text-xs leading-4 text-muted-foreground">
            <Link
              href={`${dashboardModelPath(model)}#pricing`}
              className="rounded-sm text-[#355984] underline decoration-current/35 underline-offset-3 hover:decoration-current focus-visible:outline-2 focus-visible:outline-ring dark:text-[#a0bee6]"
            >
              View full pricing
            </Link>
          </p>
        </div>
      </DialogContent>
    </>
  );
}
