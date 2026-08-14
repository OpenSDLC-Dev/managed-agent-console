"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  Boxes,
  FileText,
  KeyRound,
  // Not `Lock`: that name collides with the DOM's own global `Lock`, and the
  // import loses — a type error whose message names neither the icon nor lucide.
  KeySquare,
  MessagesSquare,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SURFACES,
  surfaceRoute,
  useSurfaces,
  type Surface,
} from "@/lib/platform/surfaces";

// Order and iconography live here; the label and the route come from the
// surface registry, so the console names a surface in exactly one place.
const ITEMS: { surface: Surface; icon: LucideIcon }[] = [
  { surface: "agents", icon: Bot },
  { surface: "sessions", icon: MessagesSquare },
  { surface: "environments", icon: Boxes },
  { surface: "vaults", icon: KeyRound },
  { surface: "skills", icon: Sparkles },
  { surface: "files", icon: FileText },
  // Last, and still top-level (plan 07 D2). The reference files this under a
  // Settings area we do not have; a self-hosted console's whole settings story
  // is its environment file, so a section holding one item would be a menu
  // built to hold a menu.
  { surface: "api-keys", icon: KeySquare },
];

export function Nav() {
  const pathname = usePathname();
  // Unknown means shown: an item disappears only once the platform has said
  // it does not serve that surface (CLAUDE.md principle 3).
  const surfaces = useSurfaces();
  return (
    <nav className="flex flex-col gap-0.5 px-2">
      <div className="px-2.5 pb-1 pt-4 text-[13px] font-medium text-muted-foreground">
        Managed Agents
      </div>
      {ITEMS.filter(({ surface }) => surfaces?.[surface] !== false).map(
        ({ icon: Icon, surface }) => {
          const href = surfaceRoute(surface);
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              data-surface={surface}
              className={cn(
                "flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-sm text-sidebar-foreground",
                active
                  ? "bg-sidebar-accent font-medium"
                  : "hover:bg-sidebar-accent/60",
              )}
            >
              <Icon
                className="size-4 text-muted-foreground"
                strokeWidth={1.75}
              />
              {SURFACES[surface].label}
            </Link>
          );
        },
      )}
    </nav>
  );
}
