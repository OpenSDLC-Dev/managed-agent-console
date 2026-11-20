"use client";

import { useEffect, useRef, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { DASHBOARD_LINK, NAV_SECTIONS, type GroupEntry } from "@/lib/nav";
import {
  isSurfaceVisible,
  SURFACES,
  surfaceOfPath,
  surfaceRoute,
  useSurfaces,
  type Surface,
} from "@/lib/platform/surfaces";
import { cn } from "@/lib/utils";
import { useNavPreference } from "./nav-preference";

const ROW = "flex h-9 items-center gap-4 rounded-lg px-2 text-sm";
const COMPACT_ROW = "flex size-9 items-center justify-center rounded-lg";
const HIGHLIGHT = "bg-sidebar-accent font-medium";
const HOVER = "hover:bg-sidebar-accent/60";

function NavLink({
  href,
  label,
  icon: Icon,
  surface,
  active,
  nested,
  popup,
  compact,
  onNavigate,
}: {
  href: string;
  label: string;
  icon?: LucideIcon;
  surface?: Surface;
  active: boolean;
  nested?: boolean;
  popup?: boolean;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      data-surface={surface}
      data-active={active}
      aria-current={active ? "page" : undefined}
      aria-label={compact ? label : undefined}
      title={compact ? label : undefined}
      className={cn(
        compact ? COMPACT_ROW : ROW,
        // Align nested labels with 8px padding + 16px icon + 16px gap.
        nested && "pl-10",
        popup && "h-8 px-2.5 py-1.5",
        "text-sidebar-foreground",
        active ? HIGHLIGHT : HOVER,
      )}
    >
      {Icon && (
        <Icon
          className={cn("size-4", !compact && "text-muted-foreground")}
          strokeWidth={1.75}
          aria-hidden
        />
      )}
      {!compact && label}
    </Link>
  );
}

function Group({
  group,
  activeSurface,
}: {
  group: GroupEntry;
  activeSurface?: Surface;
}) {
  const id = `nav-group-${group.label.toLowerCase().replace(/\s+/g, "-")}`;
  const [preference, setOpen] = useNavPreference(id);
  const active = group.items.some(({ surface }) => surface === activeSurface);
  const open = preference ?? (active || group.defaultOpen !== false);
  const { icon: Icon } = group;
  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={id}
        data-nav-group={group.label}
        data-state={open ? "open" : "closed"}
        data-active={active}
        className={cn(
          ROW,
          active && !open ? HIGHLIGHT : cn("text-muted-foreground", HOVER),
        )}
      >
        <Icon className="size-4" strokeWidth={1.75} aria-hidden />
        {group.label}
        <ChevronDown
          className={cn(
            "ml-auto size-3.5 transition-transform",
            !open && "-rotate-90",
          )}
          strokeWidth={1.75}
          aria-hidden
        />
      </button>
      <div id={id} hidden={!open}>
        <div className="flex flex-col gap-0.5">
          {group.items.map(({ surface }) => (
            <NavLink
              key={surface}
              nested
              href={surfaceRoute(surface)}
              label={SURFACES[surface].label}
              surface={surface}
              active={surface === activeSurface}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function CompactGroup({
  group,
  activeSurface,
}: {
  group: GroupEntry;
  activeSurface?: Surface;
}) {
  const [open, setOpen] = useState(false);
  const active = group.items.some(({ surface }) => surface === activeSurface);
  const { icon: Icon } = group;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        aria-label={group.label}
        title={group.label}
        data-nav-group={group.label}
        data-active={active}
        className={cn(
          COMPACT_ROW,
          "text-sidebar-foreground",
          active ? HIGHLIGHT : HOVER,
        )}
      >
        <Icon className="size-4" strokeWidth={1.75} aria-hidden />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side="right"
          align="start"
          sideOffset={12}
          className="z-50"
        >
          <Popover.Popup className="w-48 max-w-[calc(100vw-64px)] rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg outline-none">
            <Popover.Title className="px-2.5 py-1.5 text-xs font-medium text-muted-foreground">
              {group.label}
            </Popover.Title>
            {group.items.map(({ surface }) => (
              <NavLink
                key={surface}
                popup
                href={surfaceRoute(surface)}
                label={SURFACES[surface].label}
                surface={surface}
                active={surface === activeSurface}
                onNavigate={() => setOpen(false)}
              />
            ))}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function Nav({ compact = false }: { compact?: boolean }) {
  const surfaces = useSurfaces();
  const pathname = usePathname();
  const activeSurface = surfaceOfPath(pathname);
  const nav = useRef<HTMLElement>(null);
  useEffect(() => {
    // Prefer the current link. When it is hidden, reveal its group instead.
    const current = nav.current?.querySelector(
      '[aria-current="page"]:not([hidden] *), button[data-active="true"]:not([aria-expanded="true"])',
    );
    current?.scrollIntoView?.({ block: "nearest" });
  }, [pathname, surfaces, compact]);

  const available = (surface: Surface) =>
    isSurfaceVisible(surfaces?.[surface], surface);
  const GroupControl = compact ? CompactGroup : Group;
  return (
    <nav
      ref={nav}
      aria-label="Main navigation"
      className={cn("flex flex-col gap-4 pt-4", compact ? "px-1.5" : "px-3")}
    >
      <NavLink
        href={DASHBOARD_LINK.href}
        label={DASHBOARD_LINK.label}
        icon={DASHBOARD_LINK.icon}
        active={pathname === DASHBOARD_LINK.href}
        compact={compact}
      />
      {NAV_SECTIONS.map(({ heading, entries }) => {
        const rows = entries.map((entry) => {
          if (entry.kind === "surface") {
            const { surface } = entry;
            return available(surface) ? (
              <NavLink
                key={surface}
                href={surfaceRoute(surface)}
                label={SURFACES[surface].label}
                icon={entry.icon}
                surface={surface}
                active={surface === activeSurface}
                compact={compact}
              />
            ) : null;
          }
          const items = entry.items.filter(({ surface }) => available(surface));
          return items.length > 0 ? (
            <GroupControl
              key={entry.label}
              group={{ ...entry, items }}
              activeSurface={activeSurface}
            />
          ) : null;
        });
        if (!rows.some(Boolean)) return null;
        return (
          <div key={heading} className="flex flex-col gap-1">
            <h2
              className={
                compact
                  ? "sr-only"
                  : "px-2 pb-1 text-xs font-medium text-muted-foreground"
              }
            >
              {heading}
            </h2>
            {rows}
          </div>
        );
      })}
    </nav>
  );
}
