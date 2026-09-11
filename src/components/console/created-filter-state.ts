export const CREATED_PRESETS = [
  { key: "all", label: "All time", ms: null },
  { key: "today", label: "Today", ms: null },
  { key: "1h", label: "Last hour", ms: 3600_000 },
  { key: "24h", label: "Last 24 hours", ms: 24 * 3600_000 },
  { key: "7d", label: "Last 7 days", ms: 7 * 86_400_000 },
  { key: "30d", label: "Last 30 days", ms: 30 * 86_400_000 },
] as const;
export type CreatedPresetKey =
  (typeof CREATED_PRESETS)[number]["key"] | "custom";
export type CreatedRange = { start: string; end: string };
export type CreatedSelection = {
  key: CreatedPresetKey;
  gte?: string;
  lte?: string;
  range?: CreatedRange;
};

export function createdGte(
  key: CreatedPresetKey,
  nowMs = Date.now(),
): string | undefined {
  if (key === "today") {
    const today = new Date(nowMs);
    today.setHours(0, 0, 0, 0);
    return today.toISOString();
  }
  const preset = CREATED_PRESETS.find((p) => p.key === key);
  return preset?.ms ? new Date(nowMs - preset.ms).toISOString() : undefined;
}

export function parseCreatedDate(value: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day
    ? date
    : undefined;
}
export function dateValue(date: Date) {
  return `${String(date.getFullYear()).padStart(4, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function createdSelection(
  key: CreatedPresetKey,
  range?: CreatedRange,
): CreatedSelection {
  if (key !== "custom") return { key, gte: createdGte(key) };
  const start = parseCreatedDate(range?.start ?? "");
  const end = parseCreatedDate(range?.end ?? "");
  end?.setHours(23, 59, 59, 999);
  return {
    key,
    range,
    gte: start?.toISOString(),
    lte: end?.toISOString().replace(/999Z$/, "999999Z"),
  };
}

export function decodeCreatedFilter(value: string | null): CreatedSelection {
  if (!value) return { key: "all" };
  if (CREATED_PRESETS.some((preset) => preset.key === value))
    return createdSelection(value as CreatedPresetKey);
  const [start, end, extra] = value.split("~");
  if (
    extra !== undefined ||
    end === undefined ||
    (!start && !end) ||
    (start && !parseCreatedDate(start)) ||
    (end && !parseCreatedDate(end))
  )
    return { key: "all" };
  return createdSelection("custom", { start, end });
}
export function encodeCreatedFilter(
  key: CreatedPresetKey,
  range?: CreatedRange,
) {
  return key === "all"
    ? null
    : key === "custom"
      ? range?.start || range?.end
        ? range.start + "~" + range.end
        : null
      : key;
}
