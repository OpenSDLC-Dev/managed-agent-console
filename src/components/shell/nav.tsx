"use client";

import { useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { DASHBOARD_LINK, NAV_SECTIONS, type GroupEntry } from "@/lib/nav";
import {
  hasDeveloperSession,
  isSurfaceVisible,
  reportSurfaceState,
  surfaceOfPath,
  surfaceRoute,
  useSurfaces,
  type Surface,
} from "@/lib/platform/surfaces";
import { cn } from "@/lib/utils";
import { isDashboardPath, isReportPage, playgroundOnly } from "@/lib/routes";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CONSOLE_WORKSPACE } from "@/lib/platform/tenancy";
import { ConsoleSessionContext } from "./console-session";
import { useLeaveConfirmation } from "./unsaved-changes";

const ROW = "flex h-9 items-center gap-3.5 rounded-lg px-2.5 text-sm";
const HIGHLIGHT = "bg-sidebar-accent font-medium";
const HOVER = "hover:bg-sidebar-accent/60";

function NavLink({
  href,
  label,
  icon: Icon,
  surface,
  active,
}: {
  href: string;
  label: string;
  icon?: LucideIcon;
  surface?: Surface;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      data-surface={surface}
      data-active={active}
      aria-current={active ? "page" : undefined}
      className={cn(ROW, "text-sidebar-foreground", active ? HIGHLIGHT : HOVER)}
    >
      {Icon && (
        <Icon
          className="size-4 text-muted-foreground"
          strokeWidth={1.75}
          aria-hidden
        />
      )}
      {label}
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
  onOpen: () => void;
}) {
  const { icon: Icon } = group;
  const props = {
    "data-nav-group": group.label,
    "data-active": !!current,
    "aria-current": current ? ("page" as const) : undefined,
    className: cn(
      ROW,
      current ? HIGHLIGHT : cn("text-muted-foreground", HOVER),
    ),
  };
  const contents = (
    <>
      <Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
      <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
        <span className="truncate">{group.label}</span>
        {current && (
          <>
            {" "}
            <span className="max-w-[55%] shrink-0 truncate text-xs font-normal text-muted-foreground">
              {current}
            </span>
          </>
        )}
      </span>
      <ChevronRight
        className="size-3.5 shrink-0"
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
      data-managed-leave
      onNavigate={(event) => {
        event.preventDefault();
        onOpen();
      }}
    >
      {contents}
    </Link>
  ) : (
    <button {...props} type="button" onClick={onOpen}>
      {contents}
    </button>
  );
}

export function Nav({ mobile = false }: { mobile?: boolean }) {
  const surfaces = useSurfaces();
  const session = useContext(ConsoleSessionContext)?.data;
  const limited = playgroundOnly(session);
  const pathname = usePathname();
  const router = useRouter();
  const { requestLeave } = useLeaveConfirmation();
  const activeSurface = surfaceOfPath(pathname);
  const activeHref = activeSurface ? surfaceRoute(activeSurface) : pathname;
  const nav = useRef<HTMLElement>(null);
  const pendingFocus = useRef<{ pathname: string; label: string } | null>(null);
  const [selection, setSelection] = useState<{
    pathname: string;
    label: string | null;
  } | null>(null);

  // A URL change selects the destination's own navigation. Manual panel changes
  // apply only to the current page.
  if (selection && selection.pathname !== pathname) setSelection(null);
  const sections = NAV_SECTIONS.map(({ heading, groups }) => ({
    heading,
    groups: groups
      .map((group) => ({
        ...group,
        items: group.items.filter(({ surface, href }) =>
          isReportPage(href)
            ? hasDeveloperSession(session) &&
              reportSurfaceState(href, surfaces)?.status === "available"
            : surface
              ? !limited && isSurfaceVisible(surfaces?.[surface], surface)
              : limited || session?.playground_access === true,
        ),
      }))
      .filter(({ items }) => items.length > 0),
  })).filter(({ groups }) => groups.length > 0);
  const groups = sections.flatMap((section) => section.groups);
  const routeGroup = groups.find(({ items }) =>
    items.some(({ href }) => href === activeHref),
  );
  const selectedLabel =
    selection?.pathname === pathname ? selection.label : routeGroup?.label;
  const panel = groups.find(({ label }) => label === selectedLabel);
  const panelLabel = panel?.label;
  const workspacePanel =
    panelLabel === "Messages" || panelLabel === "Resources";

  useEffect(() => {
    const restoreRoutePanel = () => {
      pendingFocus.current = null;
      setSelection(null);
    };
    window.addEventListener("popstate", restoreRoutePanel);
    return () => window.removeEventListener("popstate", restoreRoutePanel);
  }, []);

  useEffect(() => {
    if (pendingFocus.current?.pathname !== pathname)
      pendingFocus.current = null;
  }, [pathname]);

  useEffect(() => {
    const focus = pendingFocus.current;
    if (focus?.pathname === pathname) {
      pendingFocus.current = null;
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
    nav.current
      ?.querySelector('[aria-current="page"], button[data-active="true"]')
      ?.scrollIntoView?.({ block: "nearest" });
  }, [pathname, surfaces, panelLabel]);

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
      className="flex flex-col gap-4 px-2 pt-2"
    >
      {panel ? (
        <div
          className={cn(
            "flex flex-col",
            workspacePanel ? "[&>a]:px-2" : "gap-1",
          )}
        >
          <h2
            aria-label={panel.label}
            className={workspacePanel ? "mb-3" : "mb-2"}
          >
            <button
              type="button"
              aria-label={`${panel.label}, back to all sections`}
              title="Back to all sections"
              data-nav-back
              onClick={back}
              className={cn(
                "grid w-full grid-cols-[1rem_minmax(0,1fr)_1rem] items-center gap-2 rounded-lg",
                workspacePanel ? "h-7 px-1.5" : "h-9 px-2.5",
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
          {workspacePanel && (
            <Select value={CONSOLE_WORKSPACE}>
              <SelectTrigger
                size="sm"
                aria-label="Workspace"
                className="mb-3 w-full border-0 bg-muted px-3 shadow-none"
              >
                <span className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="size-3 shrink-0 rounded-[3px] bg-[#9b89f5]"
                  />
                  <SelectValue>Default</SelectValue>
                </span>
              </SelectTrigger>
              <SelectContent
                align="start"
                alignItemWithTrigger={false}
                sideOffset={6}
                className="w-64 p-1.5"
              >
                <SelectItem value={CONSOLE_WORKSPACE} className="h-7 px-2">
                  <span
                    aria-hidden
                    className="size-3 shrink-0 rounded-[3px] bg-[#9b89f5]"
                  />
                  Default
                </SelectItem>
              </SelectContent>
            </Select>
          )}
          {panel.items.map(({ href, label, surface }) => (
            <NavLink
              key={href}
              href={href}
              label={label}
              surface={surface}
              active={href === activeHref}
            />
          ))}
        </div>
      ) : (
        <>
          {!limited && (
            <NavLink
              href={DASHBOARD_LINK.href}
              label={DASHBOARD_LINK.label}
              icon={DASHBOARD_LINK.icon}
              active={isDashboardPath(pathname)}
            />
          )}
          {sections.map(({ heading, groups }) => (
            <div key={heading} className="flex flex-col">
              <h2 className="mb-2 px-2 text-xs leading-[17px] text-muted-foreground">
                {heading}
              </h2>
              {groups.map((group) => {
                const current = group.items.find(
                  ({ href }) => href === activeHref,
                )?.label;
                const first = group.items[0];
                const waitingForOverview =
                  (group.label === "Messages" || group.label === "Resources") &&
                  hasDeveloperSession(session) &&
                  !surfaces;
                const destination =
                  !mobile &&
                  !current &&
                  !waitingForOverview &&
                  (!first.surface || surfaces)
                    ? first.href
                    : undefined;
                return (
                  <GroupControl
                    key={group.label}
                    group={group}
                    // A same-document link preserves the current query's encoding.
                    href={mobile ? undefined : (destination ?? "#")}
                    current={current}
                    onOpen={() => {
                      if (destination) {
                        requestLeave(() => {
                          pendingFocus.current = {
                            pathname: destination,
                            label: group.label,
                          };
                          router.push(destination);
                        });
                        return;
                      }
                      pendingFocus.current = {
                        pathname,
                        label: group.label,
                      };
                      setSelection({ pathname, label: group.label });
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
