import type { AuditFinding, AuditSeverity } from "../shared/types";

const severityRank: Record<AuditSeverity, number> = {
  low: 0,
  moderate: 1,
  high: 2,
  critical: 3,
};

function higherSeverity(a: AuditSeverity, b: AuditSeverity): AuditSeverity {
  return severityRank[a] >= severityRank[b] ? a : b;
}

/**
 * Collapses findings that share the same `advisoryId` into a single finding.
 *
 * When multiple packages are affected by the same advisory, the deduplicated
 * finding:
 *  - Uses the highest severity across all affected packages.
 *  - Carries the primary `packageName` (first seen).
 *  - Populates `affectedPackages` with all package names in the group.
 *
 * Findings with distinct advisory IDs are returned unchanged (order preserved).
 */
export function dedup(findings: AuditFinding[]): AuditFinding[] {
  const seen = new Map<string, AuditFinding>();
  const order: string[] = [];

  for (const finding of findings) {
    const key = String(finding.advisoryId);

    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, {
        ...finding,
        affectedPackages: [finding.packageName],
      });
      order.push(key);
    } else {
      // Merge: escalate severity if needed and add this package to the list.
      existing.severity = higherSeverity(existing.severity, finding.severity);
      existing.affectedPackages = [...(existing.affectedPackages ?? [existing.packageName]), finding.packageName];
    }
  }

  return order.map((key) => seen.get(key) as AuditFinding);
}
