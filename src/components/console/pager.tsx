import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Pager({
  hasPrev,
  hasNext,
  onPrev,
  onNext,
}: {
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    // Cursor state, machine-readable (see CLAUDE.md): whether the wire handed
    // back a page token in either direction. Disabled buttons say the same
    // thing, but only by inference from a control's enabled-ness.
    <div
      className="flex items-center gap-2 pt-4"
      data-testid="pager"
      data-has-prev={hasPrev}
      data-has-next={hasNext}
    >
      <Button
        variant="outline"
        size="icon"
        className="size-8 rounded-full"
        disabled={!hasPrev}
        onClick={onPrev}
        aria-label="Previous page"
      >
        <ChevronLeft className="size-4" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        className="size-8 rounded-full"
        disabled={!hasNext}
        onClick={onNext}
        aria-label="Next page"
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );
}
