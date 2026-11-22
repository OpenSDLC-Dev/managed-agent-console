import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { Breadcrumb } from "@/components/console/breadcrumb";
import { CopyIdButton } from "@/components/console/copy-id";
import {
  dashboardModelPath,
  dashboardModels,
  modelFeatures,
  modelPricingTerms,
  modelPrices,
  providerPricesChecked,
} from "@/components/console/dashboard-model-catalog";
import { DashboardModelGateway } from "@/components/console/dashboard-model-gateway";
import { cn } from "@/lib/utils";

const sourceStyle =
  "inline-flex items-center gap-0.5 rounded-sm text-sm underline decoration-muted-foreground/50 underline-offset-4 hover:decoration-current focus-visible:outline-ring";

function ModelFacts({ rows }: { rows: string[][] }) {
  return (
    <dl className="divide-y text-sm">
      {rows.map(([label, value]) => (
        <div
          key={label}
          className="flex items-baseline justify-between gap-3 py-2"
        >
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="text-right font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default async function DashboardModelPage({
  params,
}: {
  params: Promise<{ brand: string }>;
}) {
  const { brand } = await params;
  const model = dashboardModels.find((item) => item.brand === brand);
  if (!model) notFound();

  return (
    <div className="@container mx-auto w-full max-w-[960px] space-y-5 sm:px-1">
      <Breadcrumb
        parent={{ href: "/dashboard", label: "Dashboard" }}
        current={model.name}
      />
      <header className="flex flex-wrap items-center gap-4">
        <div
          className={cn(
            "grid size-20 shrink-0 place-items-center rounded-xl",
            model.band,
          )}
        >
          <Image
            src={`/brands/${brand}.svg`}
            alt=""
            width={52}
            height={48}
            unoptimized
            className="h-12 w-[52px] object-contain"
          />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{model.providerName}</p>
          <h1 className="my-1 font-serif text-3xl font-medium tracking-tight">
            {model.name}
          </h1>
          <p className="text-sm text-muted-foreground">{model.description}</p>
        </div>
      </header>
      <div className="space-y-4 rounded-xl border bg-card p-5">
        <div>
          <h2 className="text-base font-semibold">
            Using this model on Platform
          </h2>
          <p className="mt-2 max-w-prose text-sm leading-6 text-muted-foreground">
            {model.gatewayNote} Use a configured gateway alias as the model ID
            in agent configurations and API requests.
          </p>
        </div>
        <div className="border-t pt-4">
          <DashboardModelGateway model={model} />
        </div>
      </div>
      <div className="grid gap-3 @min-[39rem]:grid-cols-2">
        <section
          aria-labelledby="specifications"
          className="flex flex-col gap-3 rounded-xl bg-muted/55 p-5"
        >
          <h2 id="specifications" className="text-base font-semibold">
            Upstream specifications
          </h2>
          <ModelFacts rows={modelFeatures(model)} />
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="text-muted-foreground">Upstream model ID</span>
            <span className="inline-flex items-center gap-1.5">
              <code className="break-all text-xs">{model.id}</code>
              <CopyIdButton id={model.id} />
            </span>
          </div>
          <div className="mt-auto pt-2">
            <a
              className={sourceStyle}
              href={model.docs}
              target="_blank"
              rel="noreferrer"
            >
              Provider specifications{" "}
              <ArrowUpRight aria-hidden className="size-3.5" />
            </a>
          </div>
        </section>
        <section
          id="pricing"
          aria-labelledby="pricing-title"
          className="flex scroll-mt-6 flex-col gap-3 rounded-xl bg-muted/55 p-5"
        >
          <h2 id="pricing-title" className="text-base font-semibold">
            Provider pricing
          </h2>
          <ModelFacts rows={modelPrices(model)} />
          <p className="text-xs leading-5 text-muted-foreground">
            {modelPricingTerms(model)} Checked {providerPricesChecked}. Your
            gateway uses the rates set on each upstream deployment.
          </p>
          <div className="mt-auto pt-2">
            <a
              className={sourceStyle}
              href={model.pricing.url}
              target="_blank"
              rel="noreferrer"
            >
              Provider price list{" "}
              <ArrowUpRight aria-hidden className="size-3.5" />
            </a>
          </div>
        </section>
      </div>
      <nav
        aria-label="Model guides"
        className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t py-4 text-sm"
      >
        {dashboardModels.map((item) => (
          <Link
            key={item.brand}
            href={dashboardModelPath(item)}
            aria-current={item.brand === brand ? "page" : undefined}
            className="rounded-sm text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-ring aria-[current=page]:font-medium aria-[current=page]:text-foreground"
          >
            {item.name}
          </Link>
        ))}
      </nav>
    </div>
  );
}
