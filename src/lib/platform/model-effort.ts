/** internal/domain/agent.go Model and ModelEffort.MarshalJSON. */
export const effortLevels = ["low", "medium", "high", "xhigh", "max"] as const;
export type ModelEffort = (typeof effortLevels)[number];
