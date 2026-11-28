// Ranked series in the usage and agent reports share the legend order.
export const chartSeriesLimit = 5;
export function chartSeriesColor(index: number | null) {
  return index === null ? "var(--chart-other)" : `var(--chart-${index + 1})`;
}
