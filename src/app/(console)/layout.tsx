import Link from "next/link";
import { Nav } from "@/components/shell/nav";
import { ConnectionStatus } from "@/components/shell/connection-status";
import { Providers } from "@/components/shell/providers";

export default function ConsoleLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <Providers>
      <div className="flex min-h-screen">
        <aside className="flex w-64 shrink-0 flex-col justify-between bg-sidebar">
          <div>
            <div className="px-4 pb-1 pt-5">
              <Link href="/agents" className="text-[15px] font-semibold">
                Managed Agents
              </Link>
              <div className="text-[12px] text-muted-foreground">
                self-hosted console
              </div>
            </div>
            <Nav />
          </div>
          <div>
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
            <ConnectionStatus />
          </div>
        </aside>
        <main className="min-w-0 flex-1 px-8 py-6">{children}</main>
      </div>
    </Providers>
  );
}
