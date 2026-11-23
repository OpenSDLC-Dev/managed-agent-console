import { ageLabel } from "@/lib/session-trace/timing";
import { useNow } from "@/lib/session-trace/use-now";
import { Day } from "./bits";

export function ResourceDate({ iso }: { iso: string }) {
  const now = useNow();
  const elapsed = now - Date.parse(iso);
  return (
    <time dateTime={iso} data-timestamp={iso} title={iso}>
      {elapsed >= 0 && elapsed < 7 * 86_400_000 ? (
        ageLabel(iso, now)
      ) : (
        <Day iso={iso} />
      )}
    </time>
  );
}

export function FileSize({ bytes }: { bytes: number }) {
  const size =
    bytes < 1024
      ? bytes + (bytes === 1 ? " byte" : " bytes")
      : bytes < 1024 * 1024
        ? (bytes / 1024).toFixed(1) + " KB"
        : (bytes / (1024 * 1024)).toFixed(1) + " MB";
  return <span data-size-bytes={bytes}>{size}</span>;
}
