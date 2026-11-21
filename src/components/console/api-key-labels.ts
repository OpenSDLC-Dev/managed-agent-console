import type { NativeSession } from "@/lib/platform/native";
import type { ApiKey } from "@/lib/platform/types";

type Session = Partial<NativeSession> | null | undefined;

/** The platform accepts a name made entirely of whitespace. */
export function apiKeyDisplayName(key: ApiKey) {
  return key.name.trim() ? key.name : key.id;
}

export function apiKeyOwnerId(key: ApiKey) {
  const owner = key.principal;
  return owner?.type === "user_actor"
    ? owner.user_id
    : owner?.service_account_id;
}

function accountLabel(id: string, session: Session) {
  return session?.signed_in && session.id === id
    ? session.name || session.login_name || session.email || id
    : id;
}

export function apiKeyAccountLabel(key: ApiKey, session: Session) {
  const id = apiKeyOwnerId(key);
  return id ? accountLabel(id, session) : "Unowned";
}

export function apiKeyCreatorLabel(key: ApiKey, session: Session) {
  return key.created_by
    ? accountLabel(key.created_by.id, session)
    : "Control plane";
}

const statusLabels: Record<string, string> = {
  active: "Active",
  inactive: "Disabled",
  expired: "Expired",
  archived: "Archived",
};

export function apiKeyStatusLabel(status: string) {
  return Object.hasOwn(statusLabels, status) ? statusLabels[status] : status;
}
