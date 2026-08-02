"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Reference-style "Status" pill: Active (default) or All (incl. archived). */
export function StatusFilter({
  includeArchived,
  onChange,
}: {
  includeArchived: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 text-sm">
      <span className="text-muted-foreground">Status</span>
      <Select
        value={includeArchived ? "all" : "active"}
        onValueChange={(value) => onChange(value === "all")}
      >
        <SelectTrigger size="sm" className="h-8 rounded-lg">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="active">Active</SelectItem>
          <SelectItem value="all">All</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
