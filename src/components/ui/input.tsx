import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      // The invalid state is one opaque border and nothing else (issue #104).
      // Upstream also tints a 3px halo and thins the border to /50 in dark;
      // both composite under WCAG 1.4.11's 3:1 and no alpha rescues them —
      // the halo needs 0.60 light / 0.81 dark to reach 3:1, by which point it
      // is a solid red slab. The reference draws exactly one full-strength
      // line too (`inset 0 0 0 1px var(--cds-fill-danger)`, no alpha, no
      // halo), so full opacity is the faithful answer as well as the legible
      // one. Deliberate divergence from upstream in a vendored file — a
      // shadcn update will try to revert it. Ratios in `globals.test.ts`.
      className={cn(
        "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive-surface md:text-sm dark:bg-input/30 dark:disabled:bg-input/80",
        className
      )}
      {...props}
    />
  )
}

export { Input }
