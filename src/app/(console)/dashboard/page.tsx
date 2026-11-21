"use client";

import Link from "next/link";
import { useContext } from "react";
import { ArrowRight, BookOpen, Waypoints, type LucideIcon } from "lucide-react";
import { ConsoleSessionContext } from "@/components/shell/console-session";
import { CreateKeyButton } from "@/components/console/api-keys";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS, PLAYGROUND_LINK } from "@/lib/nav";
import {
  SURFACES,
  surfaceRoute,
  useSurfaces,
  isSurfaceVisible,
  type Surface,
} from "@/lib/platform/surfaces";

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
function SurfaceCard({
  icon: Icon,
  surface,
}: {
  icon: LucideIcon;
  surface: Surface;
}) {
  const { label, blurb } = SURFACES[surface];
  return (
    <Link
      href={surfaceRoute(surface)}
      data-dashboard-card={surface}
      className="group flex min-h-32 min-w-0 flex-col gap-2 rounded-xl border bg-background p-4 outline-hidden transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" strokeWidth={1.75} />
        <h3 className="text-sm font-semibold">{label}</h3>
        <ArrowRight
          className="ml-auto size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          strokeWidth={1.75}
          aria-hidden
        />
      </div>
      <p className="text-[13px] leading-5 text-muted-foreground">{blurb}</p>
    </Link>
  );
}

export default function DashboardPage() {
  const surfaces = useSurfaces();
  const playground =
    useContext(ConsoleSessionContext)?.data?.playground_access === true;
  const sections = NAV_SECTIONS.map(({ heading, groups }) => ({
    heading,
    items: groups.flatMap(({ items }) =>
      items.flatMap(({ surface, icon }) =>
        surface && isSurfaceVisible(surfaces?.[surface], surface)
          ? [{ surface, icon }]
          : [],
      ),
    ),
  })).filter(({ items }) => items.length > 0);

  return (
    <div
      data-dashboard-layout
      className="mx-auto w-full max-w-[960px] pt-6 sm:px-4"
    >
      <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-serif text-[22px] font-medium leading-7">
          Dashboard
        </h1>
        <div
          className="flex flex-wrap items-center gap-2"
          aria-label="Quick actions"
        >
          <a
            href="https://github.com/OpenSDLC-Dev/managed-agent-platform"
            target="_blank"
            rel="noreferrer"
            aria-label="Explore docs"
            title="Explore docs"
            className={cn(buttonVariants({ variant: "outline", size: "icon" }))}
          >
            <BookOpen />
          </a>
          {isSurfaceVisible(surfaces?.["api-keys"]) && (
            <CreateKeyButton shortcut />
          )}
          {isSurfaceVisible(surfaces?.agents) && (
            <Link href="/agents/new" className={cn(buttonVariants())}>
              <Waypoints />
              Build an agent
            </Link>
          )}
        </div>
      </header>
      {sections.length === 0 &&
        Object.values(surfaces ?? {}).some(
          (probe) => probe.status === "denied",
        ) && (
          <div className="mb-6 space-y-2 text-sm" data-no-resource-access>
            <p>You are signed in. This account has no resource access.</p>
            <a href="/setup" className="underline">
              Redeem an administrator setup code
            </a>
            <p className="text-muted-foreground">
              Or ask an organization administrator to change your role.
            </p>
          </div>
        )}
      <div>
        {sections.map(({ heading, items }) => (
          <section key={heading} className="mb-6">
            <h2 className="mb-3 text-[15px] font-semibold leading-5">
              {heading}
            </h2>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-3">
              {items.map((entry) => (
                <SurfaceCard key={entry.surface} {...entry} />
              ))}
            </div>
          </section>
        ))}
        {playground && (
          <section className="mb-6">
            <h2 className="mb-3 text-[15px] font-semibold leading-5">
              Resources
            </h2>
            <div className="max-w-sm rounded-xl border p-4">
              <h3 className="text-sm font-semibold">
                <Link href={PLAYGROUND_LINK.href}>Playground</Link>
              </h3>
              <p className="mt-2 text-[13px] leading-5 text-muted-foreground">
                Try models and prompts in the browser.
              </p>
              <Link
                href={PLAYGROUND_LINK.href}
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium hover:underline"
              >
                Open playground <ArrowRight aria-hidden className="size-3.5" />
              </Link>
            </div>
          </section>
        )}
      </div>
      <footer className="flex justify-center gap-4 py-4 text-xs text-muted-foreground">
        <a
          href="https://github.com/OpenSDLC-Dev/managed-agent-console/issues"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-4 hover:text-foreground"
        >
          Help and feedback
        </a>
      </footer>
    </div>
  );
}
