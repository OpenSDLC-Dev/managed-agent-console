"use client";

/**
 * THROWAWAY MOCKUP — not a shipped surface.
 *
 * The shipped sidebar beside the two regrouping variants, so the choice is made
 * by looking rather than by reading a description. Real tokens and real row
 * geometry, so what is on screen is what would ship; nothing calls the
 * platform, so every row shows regardless of what the deployment serves.
 *
 * Delete this directory once a variant is chosen.
 */

import Link from "next/link";
import {
  Bot,
  Boxes,
  FileText,
  KeyRound,
  KeySquare,
  MessagesSquare,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { SURFACES, type Surface } from "@/lib/platform/surfaces";
import { Brand, GroupedNav, Row, SearchRow } from "./mock-nav";

function Shell({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-[12px] text-muted-foreground">{note}</div>
      </div>
      <aside className="flex h-[520px] w-64 shrink-0 flex-col rounded-xl border bg-sidebar">
        {children}
      </aside>
    </div>
  );
}

/** The nav as it ships in v0.6.0: one static group, an icon on every row. */
const SHIPPED: { surface: Surface; icon: LucideIcon }[] = [
  { surface: "agents", icon: Bot },
  { surface: "sessions", icon: MessagesSquare },
  { surface: "environments", icon: Boxes },
  { surface: "vaults", icon: KeyRound },
  { surface: "skills", icon: Sparkles },
  { surface: "files", icon: FileText },
  { surface: "api-keys", icon: KeySquare },
];

function ShippedNav() {
  return (
    <>
      <Brand subtitle="self-hosted console" />
      <SearchRow />
      <nav className="flex flex-col gap-0.5 px-2">
        <div className="px-2.5 pb-1 pt-4 text-[13px] font-medium text-muted-foreground">
          Managed Agents
        </div>
        {SHIPPED.map(({ surface, icon }) => (
          <Row
            key={surface}
            icon={icon}
            label={SURFACES[surface].label}
            active={surface === "agents"}
          />
        ))}
      </nav>
    </>
  );
}

const FACTS: [string, string, string][] = [
  [
    "Group header",
    "36px row, 14px/20px w400, icon + chevron, radius 8px",
    "32px row (ours), icon, chevron in B only",
  ],
  [
    "Rows inside a group",
    "no icon, padding-left 40px",
    "no icon, padding-left 36px",
  ],
  ["Label column", "every label at x=52", "every label at x=44"],
  [
    "Top-level rows",
    "Dashboard then API keys, icon glyph at x=20",
    "same two, same order",
  ],
  [
    "Icons",
    "a proprietary pictogram font — glyphs, not SVG",
    "nearest lucide: House · KeyRound · Hammer · Waypoints",
  ],
];

export default function MockupPage() {
  return (
    <div className="min-h-screen bg-background px-8 py-8 text-foreground">
      <h1 className="text-[22px] font-medium">Sidebar regrouping — mockup</h1>
      <p className="max-w-3xl pt-1 text-sm text-muted-foreground">
        Throwaway. Reference facts measured in Chrome on 2026-08-17 at 1440×900.
        The reference puts an icon on top-level rows and on group headers and
        none on the rows inside a group; the order here is the reference&apos;s
        verbatim. The Dashboard landing page is at{" "}
        <Link href="/mockup/dashboard" className="underline">
          /mockup/dashboard
        </Link>
        .
      </p>

      <div className="flex flex-wrap gap-10 pt-8">
        <Shell
          title="Now — v0.6.0"
          note="one static group, an icon on every row"
        >
          <ShippedNav />
        </Shell>
        <Shell
          title="A — static group headers"
          note="header carries the icon; no chevron, nothing to click"
        >
          <GroupedNav collapsible={false} />
        </Shell>
        <Shell
          title="B — collapsible group headers"
          note="header is a button with a chevron, as the reference has it"
        >
          <GroupedNav collapsible />
        </Shell>
      </div>

      <h2 className="pt-12 text-base font-medium">Measured facts</h2>
      <div className="overflow-x-auto pt-3">
        <table className="text-sm">
          <thead>
            <tr className="text-left text-[13px] text-muted-foreground">
              <th className="h-8 pr-8 font-medium">Element</th>
              <th className="h-8 pr-8 font-medium">Reference</th>
              <th className="h-8 font-medium">This mockup</th>
            </tr>
          </thead>
          <tbody>
            {FACTS.map(([el, ref, ours]) => (
              <tr key={el} className="border-t">
                <td className="py-2 pr-8 align-top">{el}</td>
                <td className="py-2 pr-8 align-top text-muted-foreground">
                  {ref}
                </td>
                <td className="py-2 align-top text-muted-foreground">{ours}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
