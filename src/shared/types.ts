export type AuditSeverity = "low" | "moderate" | "high" | "critical";

export interface AuditFixInfo {
  name: string;
  version: string;
}

export interface AuditFinding {
  ecosystem: "npm" | "pip";
  packageName: string;
  /** All packages affected by the same advisory (populated by dedup). */
  affectedPackages?: string[];
  severity: AuditSeverity;
  advisoryId: number | string;
  title: string;
  vulnerableVersions: string;
  fixAvailable: boolean;
  patchedVersions?: string[];
  fixInfo?: AuditFixInfo[];
}

export interface AcceptedRiskEntry {
  /** CVE or ecosystem advisory ID, e.g. "CVE-2023-1234" or "GHSA-xxxx-yyyy-zzzz". */
  cve: string;
  /** Human-readable explanation of why this risk is accepted. Required. */
  reason: string;
  /** GitHub login of the person who accepted this risk. Required. */
  decidedBy: string;
}

export interface ClassificationPolicy {
  autoPatch: {
    minSeverity: AuditSeverity;
    maxSeverity: AuditSeverity;
  };
  /**
   * When true, auto-generated patch PRs may be merged automatically once CI
   * passes. Never defaults to true — must be explicitly set in policy.
   */
  autoMergePatchLevel?: boolean;
  /**
   * CVEs or advisory IDs that a human has explicitly accepted. Findings whose
   * advisoryId matches an entry here are skipped by the classifier.
   */
  acceptedRisks?: AcceptedRiskEntry[];
}

export type ClassificationDecision = "patchable" | "needs-review" | "accepted-risk";

export interface ClassifiedFinding {
  finding: AuditFinding;
  decision: ClassificationDecision;
  reason: string;
}