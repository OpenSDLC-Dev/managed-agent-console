import { apiKeyStatusLabel } from "./api-key-labels";

export function ApiKeyStatus({
  status,
  hideActive = false,
}: {
  status: string;
  hideActive?: boolean;
}) {
  return (
    <span
      data-key-status={status}
      className={
        hideActive && status === "active"
          ? "sr-only"
          : "rounded bg-muted px-1.5 text-xs text-muted-foreground data-[key-status=expired]:bg-amber-500/12 data-[key-status=expired]:text-amber-800 dark:data-[key-status=expired]:text-amber-300"
      }
    >
      {apiKeyStatusLabel(status)}
    </span>
  );
}
