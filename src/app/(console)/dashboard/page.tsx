"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { DASHBOARD_SECTIONS, type SurfaceEntry } from "@/lib/nav";
import { SURFACES, surfaceRoute, useSurfaces } from "@/lib/platform/surfaces";

/**
 * The landing page. Static: it serves no platform data, so there is nothing on
 * it that can be stale, and it needs no loading or error state.
 *
 * The one thing it does read is the surface probe the shell already runs — a
 * card is a link, and a link to a surface this deployment does not serve is a
 * link to the "unavailable" page. Same rule as the nav, same cached query, no
 * extra round trip.
 *
 * Sections and their order come from the nav itself (`lib/nav.ts`), so the
 * landing page cannot drift from the sidebar.
 */
function SurfaceCard({ entry }: { entry: SurfaceEntry }) {
  const { icon: Icon, surface } = entry;
  const { label, blurb } = SURFACES[surface];
  return (
    <Link
      href={surfaceRoute(surface)}
      data-dashboard-card={surface}
      className="group flex min-w-0 flex-col gap-1.5 rounded-xl border bg-card p-4 transition-colors hover:bg-accent/40"
    >
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" strokeWidth={1.75} />
        <span className="truncate text-sm font-medium">{label}</span>
        <ArrowRight
          className="ml-auto size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          strokeWidth={1.75}
          aria-hidden
        />
      </div>
      {/* Clamped so a row of cards is one height: these lines are written for
          this width, but `api-keys` aside they are also each page's own
          subtitle, and a subtitle is allowed to grow. */}
      <p className="line-clamp-2 text-[13px] leading-5 text-muted-foreground">
        {blurb}
      </p>
    </Link>
  );
}

export default function DashboardPage() {
  const surfaces = useSurfaces();
  const sections = DASHBOARD_SECTIONS.map(({ heading, items }) => ({
    heading,
    // Unknown means shown, as everywhere else: a card goes only once the
    // platform has said it does not serve that surface.
    items: items.filter(({ surface }) => surfaces?.[surface] !== false),
  })).filter(({ items }) => items.length > 0);

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Everything this deployment serves."
      />
      {/* Constrained rather than full-bleed, as the reference's dashboard is:
          left to stretch, four cards land as three-plus-an-orphan on a wide
          screen. The list pages fill the width because a table should. */}
      <div className="max-w-5xl">
        {sections.map(({ heading, items }) => (
          <section key={heading} className="pt-3 first:pt-0">
            <h2 className="text-[13px] font-medium text-muted-foreground">
              {heading}
            </h2>
            <div className="grid gap-3 pb-5 pt-3 sm:grid-cols-2 lg:grid-cols-4">
              {items.map((entry) => (
                <SurfaceCard key={entry.surface} entry={entry} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
