"use client";

import { useEffect, useRef, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ChevronRight, type LucideIcon } from "lucide-react";
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
  popup,
  compact,
  onNavigate,
}: {
  href: string;
  label: string;
  icon?: LucideIcon;
  surface?: Surface;
  active: boolean;
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

function GroupButton({
  group,
  active,
  onOpen,
}: {
  group: GroupEntry;
  active: boolean;
  onOpen: () => void;
}) {
  const { icon: Icon } = group;
  return (
    <button
      type="button"
      onClick={onOpen}
      data-nav-group={group.label}
      data-active={active}
      className={cn(
        ROW,
        active ? HIGHLIGHT : cn("text-muted-foreground", HOVER),
      )}
    >
      <Icon className="size-4" strokeWidth={1.75} aria-hidden />
      {group.label}
      <ChevronRight
        className="ml-auto size-3.5"
        strokeWidth={1.75}
        aria-hidden
      />
    </button>
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
  const pendingFocus = useRef<string | null>(null);
  const [selection, setSelection] = useState<{
    pathname: string;
    label: string | null;
  } | null>(null);

  // A URL change selects the destination's own navigation. Manual panel changes
  // apply only to the current page and are independent of the sidebar width.
  if (selection && selection.pathname !== pathname) setSelection(null);
  const sections = NAV_SECTIONS.map(({ heading, groups }) => ({
    heading,
    groups: groups
      .map((group) => ({
        ...group,
        items: group.items.filter(({ surface }) =>
          isSurfaceVisible(surfaces?.[surface], surface),
        ),
      }))
      .filter(({ items }) => items.length > 0),
  })).filter(({ groups }) => groups.length > 0);
  const groups = sections.flatMap((section) => section.groups);
  const routeGroup = groups.find(({ items }) =>
    items.some(({ surface }) => surface === activeSurface),
  );
  const selectedLabel =
    selection?.pathname === pathname ? selection.label : routeGroup?.label;
  const panel = compact
    ? undefined
    : groups.find(({ label }) => label === selectedLabel);
  const panelLabel = panel?.label;

  useEffect(() => {
    const focus = pendingFocus.current;
    pendingFocus.current = null;
    if (focus && !compact) {
      const target = panelLabel
        ? nav.current?.querySelector<HTMLButtonElement>("[data-nav-back]")
        : Array.from(
            nav.current?.querySelectorAll<HTMLButtonElement>(
              "[data-nav-group]",
            ) ?? [],
          ).find((button) => button.dataset.navGroup === focus);
      target?.focus();
    }
    nav.current
      ?.querySelector('[aria-current="page"], button[data-active="true"]')
      ?.scrollIntoView?.({ block: "nearest" });
  }, [pathname, surfaces, compact, panelLabel]);

  const back = () => {
    pendingFocus.current = panelLabel ?? null;
    setSelection({ pathname, label: null });
  };

  return (
    <nav
      ref={nav}
      aria-label="Main navigation"
      data-nav-view={panelLabel ?? "root"}
      onKeyDown={(event) => {
        if (panel && event.key === "Escape" && !event.defaultPrevented) {
          event.preventDefault();
          back();
        }
      }}
      className={cn("flex flex-col gap-4 pt-4", compact ? "px-1.5" : "px-3")}
    >
      {panel ? (
        <div className="flex flex-col gap-1">
          <div className="mb-2 flex items-center gap-2">
            <button
              type="button"
              aria-label="Back to all sections"
              title="Back to all sections"
              data-nav-back
              onClick={back}
              className={cn(COMPACT_ROW, "text-muted-foreground", HOVER)}
            >
              <ArrowLeft className="size-4" strokeWidth={1.75} aria-hidden />
            </button>
            <h2 className="text-sm font-semibold">{panel.label}</h2>
          </div>
          {panel.items.map(({ surface }) => (
            <NavLink
              key={surface}
              href={surfaceRoute(surface)}
              label={SURFACES[surface].label}
              surface={surface}
              active={surface === activeSurface}
            />
          ))}
        </div>
      ) : (
        <>
          <NavLink
            href={DASHBOARD_LINK.href}
            label={DASHBOARD_LINK.label}
            icon={DASHBOARD_LINK.icon}
            active={pathname === DASHBOARD_LINK.href}
            compact={compact}
          />
          {sections.map(({ heading, groups }) => (
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
              {groups.map((group) =>
                compact ? (
                  <CompactGroup
                    key={group.label}
                    group={group}
                    activeSurface={activeSurface}
                  />
                ) : (
                  <GroupButton
                    key={group.label}
                    group={group}
                    active={group === routeGroup}
                    onOpen={() => {
                      pendingFocus.current = group.label;
                      setSelection({ pathname, label: group.label });
                    }}
                  />
                ),
              )}
            </div>
          ))}
        </>
      )}
    </nav>
  );
}
