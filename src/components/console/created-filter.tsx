"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

/**
 * Reference-style "Created" preset filter (plan 03 decision 6): presets map
 * to `created_at[gte]`, computed once at selection time so the query key
 * stays stable.
 */

export const CREATED_PRESETS = [
  { key: "all", label: "All time", ms: null },
  { key: "24h", label: "Last 24 hours", ms: 24 * 3600_000 },
  { key: "7d", label: "Last 7 days", ms: 7 * 86_400_000 },
  { key: "30d", label: "Last 30 days", ms: 30 * 86_400_000 },
] as const;

export type CreatedPresetKey = (typeof CREATED_PRESETS)[number]["key"];

/** The preset's `created_at[gte]` value; undefined for "all". */
export function createdGte(
  key: CreatedPresetKey,
  nowMs = Date.now(),
): string | undefined {
  const preset = CREATED_PRESETS.find((p) => p.key === key);
  if (!preset?.ms) return undefined;
  return new Date(nowMs - preset.ms).toISOString();
}

export function CreatedFilter({
  value,
  onChange,
}: {
  value: CreatedPresetKey;
  onChange: (key: CreatedPresetKey) => void;
}) {
  return (
    <div className="flex items-center gap-1.5 text-sm">
      <span className="text-muted-foreground">Created</span>
      <Select
        value={value}
        onValueChange={(key) => onChange(key as CreatedPresetKey)}
      >
        <SelectTrigger
          size="sm"
          className="h-8 rounded-lg"
          aria-label="Created filter"

          data-value={value}
        >
          {/* The label, not the raw preset key ("7d"), belongs on the pill. */}
          <span>{CREATED_PRESETS.find((p) => p.key === value)?.label}</span>
        </SelectTrigger>
        <SelectContent>
          {CREATED_PRESETS.map((preset) => (
            <SelectItem key={preset.key} value={preset.key}>
              {preset.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
