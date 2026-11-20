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

const ROW = "flex h-9 items-center gap-3.5 rounded-lg px-2.5 text-sm";
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

function GroupControl({
  group,
  href,
  current,
  onOpen,
}: {
  group: GroupEntry;
  href?: string;
  current?: string;
  onOpen: (event?: { preventDefault: () => void }) => void;
}) {
  const { icon: Icon } = group;
  const props = {
    "data-nav-group": group.label,
    "data-active": !!current,
    "aria-current": current ? ("page" as const) : undefined,
    className: cn(
      ROW,
      current ? cn("h-11", HIGHLIGHT) : cn("text-muted-foreground", HOVER),
    ),
  };
  const contents = (
    <>
      <Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
      <span className="min-w-0 truncate">
        {group.label}
        {current && (
          <>
            {" "}
            <span className="block truncate text-xs font-normal text-muted-foreground">
              {current}
            </span>
          </>
        )}
      </span>
      <ChevronRight
        className="ml-auto size-3.5 shrink-0"
        strokeWidth={1.75}
        aria-hidden
      />
    </>
  );
  return href ? (
    <Link
      {...props}
      href={href}
      prefetch={href === "#" ? false : undefined}
      onNavigate={onOpen}
    >
      {contents}
    </Link>
  ) : (
    <button {...props} type="button" onClick={() => onOpen()}>
      {contents}
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

export function Nav({
  compact = false,
  mobile = false,
}: {
  compact?: boolean;
  mobile?: boolean;
}) {
  const surfaces = useSurfaces();
  const pathname = usePathname();
  const activeSurface = surfaceOfPath(pathname);
  const nav = useRef<HTMLElement>(null);
  const pendingFocus = useRef<{ pathname: string; label: string } | null>(null);
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
    if (focus?.pathname === pathname) {
      pendingFocus.current = null;
      if (!compact) {
        const target = panelLabel
          ? nav.current?.querySelector<HTMLButtonElement>("[data-nav-back]")
          : Array.from(
              nav.current?.querySelectorAll<HTMLElement>("[data-nav-group]") ??
                [],
            ).find((row) => row.dataset.navGroup === focus.label);
        if (target) {
          target.focus();
          return;
        }
      }
    }
    nav.current
      ?.querySelector('[aria-current="page"], button[data-active="true"]')
      ?.scrollIntoView?.({ block: "nearest" });
  }, [pathname, surfaces, compact, panelLabel]);

  const back = () => {
    if (panelLabel) pendingFocus.current = { pathname, label: panelLabel };
    setSelection({ pathname, label: null });
  };

  return (
    <nav
      ref={nav}
      aria-label="Main navigation"
      data-nav-view={panelLabel ?? "root"}
      onKeyDown={(event) => {
        if (
          !mobile &&
          panel &&
          event.key === "Escape" &&
          !event.defaultPrevented
        ) {
          event.preventDefault();
          back();
        }
      }}
      className={cn("flex flex-col gap-4 pt-2", compact ? "px-1.5" : "px-2")}
    >
      {panel ? (
        <div className="flex flex-col gap-1">
          <h2 aria-label={panel.label} className="mb-2">
            <button
              type="button"
              aria-label={`${panel.label}, back to all sections`}
              title="Back to all sections"
              data-nav-back
              onClick={back}
              className={cn(
                "grid h-9 w-full grid-cols-[1rem_minmax(0,1fr)_1rem] items-center gap-2 rounded-lg px-2.5",
                HOVER,
              )}
            >
              <ArrowLeft
                className="size-4 text-muted-foreground"
                strokeWidth={1.75}
                aria-hidden
              />
              <span className="truncate text-center text-sm font-semibold">
                {panel.label}
              </span>
            </button>
          </h2>
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
            <div
              key={heading}
              className={cn("flex flex-col", compact && "gap-1")}
            >
              <h2
                className={
                  compact
                    ? "sr-only"
                    : "mb-2 px-2 text-xs leading-[17px] text-muted-foreground"
                }
              >
                {heading}
              </h2>
              {groups.map((group) => {
                if (compact)
                  return (
                    <CompactGroup
                      key={group.label}
                      group={group}
                      activeSurface={activeSurface}
                    />
                  );

                const current =
                  group === routeGroup && activeSurface
                    ? SURFACES[activeSurface].label
                    : undefined;
                const destination = current
                  ? pathname
                  : surfaceRoute(group.items[0].surface);
                return (
                  <GroupControl
                    key={group.label}
                    group={group}
                    // A same-document link preserves the current query's encoding.
                    href={mobile ? undefined : current ? "#" : destination}
                    current={current}
                    onOpen={(event) => {
                      pendingFocus.current = {
                        pathname: mobile ? pathname : destination,
                        label: group.label,
                      };
                      if (mobile || current) {
                        event?.preventDefault();
                        setSelection({ pathname, label: group.label });
                      }
                    }}
                  />
                );
              })}
            </div>
          ))}
        </>
      )}
    </nav>
  );
}
