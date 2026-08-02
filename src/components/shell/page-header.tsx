export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 pb-5">
      <div>
        {/* Reference: 22px / 500 / 28px (docs/design-reference.md) */}
        <h1 className="text-[22px] font-medium leading-7 text-foreground">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm leading-5 text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  );
}
