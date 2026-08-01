export type AuditSeverity = "low" | "moderate" | "high" | "critical";

export interface AuditFixInfo {
  name: string;
  version: string;
}

export interface AuditFinding {
  ecosystem: "npm" | "pip";
  packageName: string;
  severity: AuditSeverity;
  advisoryId: number | string;
  title: string;
  vulnerableVersions: string;
  fixAvailable: boolean;
  patchedVersions?: string[];
  fixInfo?: AuditFixInfo[];
}

export interface ClassificationPolicy {
  autoPatch: {
    minSeverity: AuditSeverity;
    maxSeverity: AuditSeverity;
  };
}

export type ClassificationDecision = "patchable" | "needs-review";

export interface ClassifiedFinding {
  finding: AuditFinding;
  decision: ClassificationDecision;
  reason: string;
}