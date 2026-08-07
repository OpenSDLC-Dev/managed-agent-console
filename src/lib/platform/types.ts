/**
 * The platform's rendered wire shapes, as types.
 *
 * These are **inferred from [./schemas](./schemas.ts)**, which is the
 * transcription of record (platform file:line cites live there, alongside the
 * conformance suite that proves the fixtures still match). This module is the
 * public surface every consumer imports; it exists so nothing outside
 * `src/lib/platform/` needs to touch zod, and an eslint rule enforces that.
 *
 * The re-export is `export type`, erased whole at compile time — importing a
 * type from here never pulls the schema module (or zod) into a bundle.
 */
export type {
  Agent,
  ContentBlock,
  CredentialAuth,
  Environment,
  EnvironmentConfig,
  ModelRef,
  ModelUsage,
  Networking,
  Packages,
  PlatformFile,
  Session,
  SessionAgent,
  SessionEvent,
  SessionResource,
  SessionStatus,
  SessionUsage,
  Skill,
  SkillRef,
  SkillVersion,
  StopReason,
  Vault,
  VaultCredential,
} from "./schemas";
