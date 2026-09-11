import type { ReactNode } from "react";

export function EnvironmentSection({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 border-t py-6 first:border-t-0 first:pt-0">
      <div>
        <div className="flex max-w-[800px] items-center justify-between gap-2">
          <h2 className="text-[15px] font-medium">{title}</h2>
          {action}
        </div>
        {hint && (
          <p className="pt-1 text-[13px] text-muted-foreground">{hint}</p>
        )}
      </div>
      <div className="min-w-0 max-w-[800px] space-y-4">{children}</div>
    </section>
  );
}
