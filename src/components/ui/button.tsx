import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // No `aria-invalid:` styling. Upstream ships a danger border and halo here,
  // but a Button is not a field the platform can call invalid — the console's
  // only invalid controls are `input.tsx` and `select.tsx` — so the rules
  // never rendered, and issue #104's point is that a value chosen against
  // nothing cannot be verified. Removed rather than re-tinted; a Button that
  // ever needs one should copy input.tsx's single opaque border.
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        // The wash is `destructive-surface`, the label `destructive`: a colour
        // cannot reach AA against a tint of itself (globals.css, issue #90).
        //
        // No focus-ring override. Upstream tints the ring with the danger
        // colour, but a tint of it composites to 1.43:1 against the page —
        // under WCAG 1.4.11's 3:1 for a focus indicator, and a red ring only
        // clears it at alpha 0.75 light / 1.0 dark, which is a solid halo
        // nobody asked for. So the variant inherits the console's own ring,
        // which makes focus uniform and, since #110 made `--ring` opaque,
        // passing: the halo measures 3.65:1 light and 3.88:1 dark in Chrome.
        // The parenthetical here used to read "3.67:1 light, 3.88:1 dark" —
        // near enough the same pair, off a model that had dropped the token's
        // alpha and so described a ring that was really painting at 1.39:1.
        destructive:
          "bg-destructive-surface/10 text-destructive hover:bg-destructive-surface/20 dark:bg-destructive-surface/20 dark:hover:bg-destructive-surface/30",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        // px-3 (12px), not upstream shadcn's px-2.5 (10px): the Claude Console
        // reference measures 12px on its 32px-high buttons
        // (docs/design-reference.md, issue #37). Deliberate divergence from
        // upstream in a vendored file — a shadcn update will try to revert it.
        default:
          "h-8 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs":
          "size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
