import type { PolicyReason } from "./policy";

/** Where tool denials are recorded (docs/DATABASE.md §10). Never receives content. */
export interface AuditSink {
  policyDenied(toolName: string, reason: PolicyReason): Promise<void>;
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9_.:-]{1,64}$/;

/** Model-chosen names are untrusted: anything unusual is recorded as "unknown". */
export const safeToolName = (name: unknown) => (typeof name === "string" && SAFE_IDENTIFIER.test(name) ? name : "unknown");
