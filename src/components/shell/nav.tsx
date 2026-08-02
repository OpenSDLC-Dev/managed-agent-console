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

const ITEMS: { href: string; label: string; icon: LucideIcon }[] = [
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/sessions", label: "Sessions", icon: MessagesSquare },
  { href: "/environments", label: "Environments", icon: Boxes },
  { href: "/vaults", label: "Credential vaults", icon: KeyRound },
  { href: "/skills", label: "Skills", icon: Sparkles },
  { href: "/files", label: "Files", icon: FileText },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5 px-2">
      <div className="px-2.5 pb-1 pt-4 text-[13px] font-medium text-muted-foreground">
        Managed Agents
      </div>
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-sm text-sidebar-foreground",
              active
                ? "bg-sidebar-accent font-medium"
                : "hover:bg-sidebar-accent/60",
            )}
          >
            <Icon className="size-4 text-muted-foreground" strokeWidth={1.75} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
