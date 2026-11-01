// Private self-hosting surfaces. These have no freshly observed reference
// counterpart. The real-platform Chrome walker is test/native/fidelity.spec.ts.
export const NATIVE_SURFACES = [
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
