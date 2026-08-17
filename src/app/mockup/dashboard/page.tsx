"use client";

/**
 * THROWAWAY MOCKUP — the Dashboard landing page, shown inside the regrouped
 * sidebar so the whole screen can be judged at once.
 *
 * Static by design: it serves no platform data, so there is nothing here that
 * can be stale or wrong. Every card's copy is the destination page's own
 * `subtitle`, not new prose — one fact, one home (CLAUDE.md).
 */

import Link from "next/link";
import {
  ArrowRight,
  Bot,
  Boxes,
  FileText,
  KeyRound,
  KeySquare,
  MessagesSquare,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { GroupedNav } from "../mock-nav";

interface Card {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Verbatim from the destination page's PageHeader subtitle. */
  blurb: string;
}

const SECTIONS: { heading: string; cards: Card[] }[] = [
  {
    heading: "Managed Agents",
    cards: [
      {
        label: "Agents",
        href: "/agents",
        icon: Bot,
        blurb: "Create and manage autonomous agents.",
      },
      {
        label: "Sessions",
        href: "/sessions",
        icon: MessagesSquare,
        blurb: "Trace and debug agent sessions.",
      },
      {
        label: "Environments",
        href: "/environments",
        icon: Boxes,
        blurb: "Configuration templates for session sandboxes.",
      },
      {
        label: "Credential vaults",
        href: "/vaults",
        icon: KeyRound,
        blurb: "Credentials your agents use for MCP servers and other tools.",
      },
    ],
  },
  {
    heading: "Build",
    cards: [
      {
        label: "Files",
        href: "/files",
        icon: FileText,
        blurb: "Uploads and session outputs available as session mounts.",
      },
      {
        label: "Skills",
        href: "/skills",
        icon: Sparkles,
        blurb: "Packaged instructions and scripts agents load on demand.",
      },
    ],
  },
  {
    heading: "Manage",
    cards: [
      {
        label: "API keys",
        href: "/api-keys",
        icon: KeySquare,
        blurb:
          "API keys carry full management authority and stay active after the person who created them is gone.",
      },
    ],
  },
];

function SurfaceCard({ card }: { card: Card }) {
  const { icon: Icon, label, blurb, href } = card;
  return (
    <Link
      href={href}
      className="group flex min-w-0 flex-col gap-1.5 rounded-xl border bg-card p-4 transition-colors hover:bg-accent/40"
    >
      <div className="flex items-center gap-2">
        <Icon className="size-4 text-muted-foreground" strokeWidth={1.75} />
        <span className="text-sm font-medium">{label}</span>
        <ArrowRight
          className="ml-auto size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          strokeWidth={1.75}
        />
      </div>
      {/* Clamped so every card is one height: these are the destination pages'
          own subtitles and one of them is a sentence and a half. */}
      <p className="line-clamp-2 text-[13px] leading-5 text-muted-foreground">
        {blurb}
      </p>
    </Link>
  );
}

export default function MockupDashboardPage() {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="flex w-64 shrink-0 flex-col bg-sidebar">
        <GroupedNav collapsible activeHref="/dashboard" />
      </aside>

      {/* The reference's dashboard constrains its content rather than filling
          the viewport, and the cards need that: left to stretch, four of them
          land as three-plus-an-orphan on a wide screen. */}
      <main className="min-w-0 flex-1 px-8 py-6">
        <div className="max-w-5xl">
          <h1 className="text-[22px] font-medium leading-7">Dashboard</h1>
          <p className="pt-1 text-sm leading-5 text-muted-foreground">
            Everything this deployment serves.
          </p>

          {SECTIONS.map(({ heading, cards }) => (
            <section key={heading} className="pt-8">
              <h2 className="text-[13px] font-medium text-muted-foreground">
                {heading}
              </h2>
              <div className="grid gap-3 pt-3 sm:grid-cols-2 lg:grid-cols-4">
                {cards.map((card) => (
                  <SurfaceCard key={card.href} card={card} />
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-10 max-w-2xl rounded-lg border border-dashed p-4 text-[13px] leading-5 text-muted-foreground">
          <span className="font-medium text-foreground">Open question.</span>{" "}
          The sidebar puts API keys second, right after Dashboard, because that
          is where the reference has it. These cards instead lead with Managed
          Agents and file API keys last under <em>Manage</em>, on the grounds
          that a landing page should open on the work rather than on an admin
          surface. Say which you want and the sections reorder.
        </div>
      </main>
    </div>
  );
}
