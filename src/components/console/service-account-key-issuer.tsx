"use client";

import { useContext, type RefObject } from "react";
import { ConsoleSessionContext } from "@/components/shell/console-session";
import type { ServiceAccount } from "@/lib/platform/native";
import { KeyCreation } from "./api-keys";

export function ServiceAccountKeyIssuer({
  account,
  onClose,
  returnFocus,
}: {
  account: ServiceAccount;
  onClose: () => void;
  returnFocus?: RefObject<HTMLElement | null>;
}) {
  const session = useContext(ConsoleSessionContext)?.data;
  if (
    !session?.signed_in ||
    !session.id ||
    session.role !== "admin" ||
    account.archived_at
  )
    return null;
  return (
    <KeyCreation
      key={`${session.id}:${account.id}`}
      target={{ account, onClose, returnFocus }}
    />
  );
}
