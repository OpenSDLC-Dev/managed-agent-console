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
  AgentReference,
  AgentMultiagent,
  AgentRosterRef,
  ContentBlock,
  CredentialAuth,
  Deployment,
  DeploymentPausedReason,
  DeploymentResource,
  DeploymentRun,
  DeploymentSchedule,
  Dream,
  DreamInput,
  DreamOutput,
  DreamOutputBehavior,
  DreamStatus,
  Environment,
  EnvironmentConfig,
  EnvironmentKey,
  EnvironmentKeyIssued,
  EnvironmentKeyPage,
  Memory,
  MemoryActor,
  MemoryListItem,
  MemoryPrefix,
  MemoryStore,
  MemoryVersion,
  KeyActor,
  ApiKey,
  ApiKeyIssued,
  ModelRef,
  ModelUsage,
  Networking,
  OutcomeEvaluation,
  Packages,
  PlatformFile,
  Session,
  SessionAgent,
  SessionMultiagent,
  SessionEvent,
  SessionResource,
  SessionStatus,
  SessionThread,
  SessionThreadAgent,
  SessionUsage,
  Skill,
  SkillRef,
  SkillVersion,
  StopReason,
  Vault,
  VaultCredential,
} from "./schemas";
