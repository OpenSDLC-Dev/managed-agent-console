import Link from "next/link";

export function Breadcrumb({
  parent,
  current,
}: {
  parent: { href: string; label: string };
  current: string;
}) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="pb-3 text-[13px] text-muted-foreground"
    >
      <Link href={parent.href} className="hover:text-foreground">
        {parent.label}
      </Link>
      <span aria-hidden="true"> / </span>
      <span className="text-foreground">{current}</span>
    </nav>
  );
}
