import { ConsoleShell } from "@/components/shell/console-shell";
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
      <ConsoleShell
        footer={
          <>
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
            <SidebarFooter />
          </>
        }
      >
        <SurfaceGuard>{children}</SurfaceGuard>
      </ConsoleShell>
    </Providers>
  );
}
