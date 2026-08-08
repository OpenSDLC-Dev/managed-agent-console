"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  Boxes,
  FileText,
  KeyRound,
  MessagesSquare,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSurfaces, type Surface } from "@/lib/platform/surfaces";

const ITEMS: {
  href: string;
  label: string;
  icon: LucideIcon;
  surface: Surface;
}[] = [
  { href: "/agents", label: "Agents", icon: Bot, surface: "agents" },
  {
    href: "/sessions",
    label: "Sessions",
    icon: MessagesSquare,
    surface: "sessions",
  },
  {
    href: "/environments",
    label: "Environments",
    icon: Boxes,
    surface: "environments",
  },
  {
    href: "/vaults",
    label: "Credential vaults",
    icon: KeyRound,
    surface: "vaults",
  },
  { href: "/skills", label: "Skills", icon: Sparkles, surface: "skills" },
  { href: "/files", label: "Files", icon: FileText, surface: "files" },
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
        ({ href, label, icon: Icon, surface }) => {
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
              {label}
            </Link>
          );
        },
      )}
    </nav>
  );
}
