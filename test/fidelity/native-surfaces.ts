// Private self-hosting surfaces. These have no freshly observed reference
// counterpart. The real-platform Chrome walker is test/native/fidelity.spec.ts.
export const NATIVE_SURFACES = [
  {
    id: "native-owned-key-list",
    route: "/api-keys",
    fixture: "human and service-owned keys",
    description:
      "Owner and creator stay separate; current row authority controls lifecycle.",
  },
  {
    id: "native-owned-key-form",
    route: "/api-keys",
    fixture: "native self-owned creation",
    description: "Self ownership and owner-role/deactivation-aware copy.",
  },
  {
    id: "native-owned-key-owner-picker",
    route: "/api-keys",
    fixture: "active service-account selection",
    description:
      "Admin selects an existing active account; archived accounts stay absent.",
  },
  {
    id: "native-owned-key-reveal",
    route: "/api-keys",
    fixture: "successful real issuance, plaintext masked",
    description:
      "Reveal once with clipboard-only copy; the screenshot never retains the key.",
  },
  {
    id: "native-owned-key-dashboard-form",
    route: "/dashboard",
    fixture: "Dashboard key shortcut",
    description: "The same native owned-key dialog from Dashboard.",
  },
  {
    id: "native-identity-loading",
    route: "/members",
    fixture: "held initial session metadata",
    description:
      "No private page or admission query before the initial principal.",
  },
  {
    id: "native-identity-failure",
    route: "/members",
    fixture: "initial session metadata outage",
    description: "An unbound document stays closed through session retries.",
  },
  {
    id: "native-password-login",
    route: "/login",
    fixture: "anonymous password mode",
    description: "Named local account, not the legacy shared console password.",
  },
  {
    id: "native-login-keyboard-error",
    route: "/login",
    fixture: "refused password sign-in",
    description:
      "Transient password cleared, refusal announced, keyboard focus visible.",
  },
  {
    id: "native-oidc-login",
    route: "/login",
    fixture: "native OIDC config",
    description: "Platform-owned top-level sign-in, no local RP exchange.",
  },
  {
    id: "native-setup",
    route: "/setup",
    fixture: "anonymous password setup",
    description: "Code, login name and UTF-8 password policy.",
  },
  {
    id: "native-setup-refused",
    route: "/setup",
    fixture: "existing local admin",
    description: "Backend setup refusal, no guessed eligibility flag.",
  },
  {
    id: "native-no-resources",
    route: "/dashboard",
    fixture: "active user role",
    description:
      "Signed in without resource authority, with setup and logout controls.",
  },
  {
    id: "native-members",
    route: "/members",
    fixture: "local and mapped members",
    description: "Current roles and the non-editable IdP role indication.",
  },
  {
    id: "native-member-create",
    route: "/members",
    fixture: "local member dialog",
    description: "Keyboard-operated local account creation.",
  },
  {
    id: "native-last-admin",
    route: "/members",
    fixture: "last-human-admin refusal",
    description: "The platform refusal remains inline; no client-side guess.",
  },
  {
    id: "native-members-loading",
    route: "/members",
    fixture: "delayed collection",
    description: "Table skeleton before collection admission completes.",
  },
  {
    id: "native-service-accounts",
    route: "/service-accounts",
    fixture: "active and archived service accounts",
    description: "Archive state and no automatic API key promise.",
  },
  {
    id: "native-service-account-edit",
    route: "/service-accounts",
    fixture: "account editor",
    description: "Immutable name, editable description and organization role.",
  },
  {
    id: "native-dashboard-unimplemented",
    route: "/dashboard",
    fixture: "unimplemented collection probes",
    description: "Absent collections are not diagnosed as account-wide denial.",
  },
  {
    id: "native-members-pending-create",
    route: "/members",
    fixture: "pending local create after dismissal",
    description: "Focus returns to inactive Create while its write settles.",
  },
  {
    id: "native-members-pending-removal",
    route: "/members",
    fixture: "pending non-self removal after dismissal",
    description: "Create stays disabled until the admitted write settles.",
  },
  {
    id: "native-members-pending-role",
    route: "/members",
    fixture: "pending non-self role update",
    description: "A pending role write cannot open a new create draft.",
  },
  {
    id: "native-member-create-refused",
    route: "/members",
    fixture: "duplicate local login refusal",
    description: "Non-secret draft stays; the transient password is cleared.",
  },
  {
    id: "native-service-account-pending-create",
    route: "/service-accounts",
    fixture: "pending create after dismissal",
    description: "Create stays disabled while the earlier create settles.",
  },
  {
    id: "native-service-account-pending-update",
    route: "/service-accounts",
    fixture: "pending update after dismissal",
    description: "Create stays disabled while the earlier edit settles.",
  },
  {
    id: "native-service-account-pending-archive",
    route: "/service-accounts",
    fixture: "pending archive after dismissal",
    description: "Create stays disabled while the admitted archive settles.",
  },
].map((surface) => ({ ...surface, mode: "platform" as const }));

export function selectNativeSurfaces(selection?: string) {
  if (!selection) return NATIVE_SURFACES;
  const ids = selection.split(",");
  const unknown = ids.filter(
    (id) => !NATIVE_SURFACES.some((surface) => surface.id === id),
  );
  if (unknown.length)
    throw new Error(`Unknown NATIVE_FIDELITY_IDS: ${unknown.join(",")}`);
  return NATIVE_SURFACES.filter((surface) => ids.includes(surface.id));
}
