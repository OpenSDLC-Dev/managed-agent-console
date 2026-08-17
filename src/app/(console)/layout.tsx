import Link from "next/link";
import { Nav } from "@/components/shell/nav";
import { CommandPalette } from "@/components/shell/command-palette";
import { Providers } from "@/components/shell/providers";
import { SidebarFooter } from "@/components/shell/sidebar-footer";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { ConsoleVersion } from "@/components/shell/version";
import { SurfaceGuard } from "@/components/shell/surface-guard";

export default function ConsoleLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <Providers>
      <div className="flex min-h-screen">
        <aside className="flex w-64 shrink-0 flex-col justify-between bg-sidebar">
          <div>
            {/* The wordmark stands alone: the second line used to say what kind
                of console this is, which the nav below now says better by
                naming what the deployment serves. It points at the landing
                page rather than at a surface. */}
            <div className="px-4 pb-1 pt-5">
              <Link href="/dashboard" className="text-[15px] font-semibold">
                Agent Console
              </Link>
            </div>
            <div className="flex flex-col pt-3">
              <CommandPalette />
            </div>
            <Nav />
          </div>
          <div>
            <div className="px-4 pb-3">
              <ThemeToggle />
            </div>
            <div className="px-4 pb-2 text-[13px]">
              <a
                href="https://github.com/OpenSDLC-Dev/managed-agent-platform"
                target="_blank"
                rel="noreferrer"
                className="text-muted-foreground hover:text-foreground"
              >
                Platform documentation ↗
              </a>
            </div>
            <ConsoleVersion />
            {/* The account sits above the platform's health, because it is
                about this browser rather than about the deployment — and the
                reference console puts the account in this corner too. Their
                order and the rule that separates them from the sidebar above
                are the group's, not each block's (#107). */}
            <SidebarFooter />
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-8 py-6">
          <SurfaceGuard>{children}</SurfaceGuard>
        </main>
      </div>
    </Providers>
  );
}
