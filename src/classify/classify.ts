import type { AuditFinding, ClassifiedFinding, ClassificationPolicy, AuditSeverity } from "../shared/types";

const severityRank: Record<AuditSeverity, number> = {
  low: 0,
  moderate: 1,
  high: 2,
  critical: 3,
};

function isWithinAutoPatchWindow(severity: AuditSeverity, policy: ClassificationPolicy): boolean {
  return (
    severityRank[severity] >= severityRank[policy.autoPatch.minSeverity] &&
    severityRank[severity] <= severityRank[policy.autoPatch.maxSeverity]
  );
}

function hasSafeFix(finding: AuditFinding): boolean {
  return finding.fixAvailable || Boolean(finding.patchedVersions?.length);
}

function isAcceptedRisk(finding: AuditFinding, policy: ClassificationPolicy): string | undefined {
  return policy.acceptedRisks?.find(
    (entry) => String(entry.cve) === String(finding.advisoryId),
  )?.reason;
}

export function classify(findings: AuditFinding[], policy: ClassificationPolicy): ClassifiedFinding[] {
  return findings.map((finding) => {
    const acceptedReason = isAcceptedRisk(finding, policy);
    if (acceptedReason !== undefined) {
      return {
        finding,
        decision: "accepted-risk",
        reason: acceptedReason,
      } satisfies ClassifiedFinding;
    }

    if (hasSafeFix(finding) && isWithinAutoPatchWindow(finding.severity, policy)) {
      return {
        finding,
        decision: "patchable",
        reason: "A fix is available and the severity falls within the auto-patch window.",
      } satisfies ClassifiedFinding;
    }

    return {
      finding,
      decision: "needs-review",
      reason: hasSafeFix(finding)
        ? "A fix exists, but the severity is outside the auto-patch window."
        : "No safe fix is available yet.",
    } satisfies ClassifiedFinding;
  });
}