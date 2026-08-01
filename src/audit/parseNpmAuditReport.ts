import type { AuditFinding, AuditSeverity } from "../shared/types";

interface NpmAuditMetadata {
  vulnerabilities?: Record<string, { severity?: string }>;
}

interface NpmAuditAdvisory {
  severity?: string;
  title?: string;
  vulnerable_versions?: string;
  patched_versions?: string;
  fix_available?: boolean | string;
}

interface NpmAuditReport {
  metadata?: NpmAuditMetadata;
  vulnerabilities?: Record<string, NpmAuditAdvisory>;
}

const allowedSeverities: AuditSeverity[] = ["low", "moderate", "high", "critical"];

function toSeverity(value: string | undefined): AuditSeverity {
  if (value && allowedSeverities.includes(value as AuditSeverity)) {
    return value as AuditSeverity;
  }

  return "moderate";
}

export function parseNpmAuditReport(output: string): AuditFinding[] {
  const report = JSON.parse(output) as NpmAuditReport;
  const vulnerabilities = report.vulnerabilities ?? {};

  return Object.entries(vulnerabilities).map(([packageName, advisory], index) => {
    const severity = toSeverity(advisory.severity ?? report.metadata?.vulnerabilities?.[packageName]?.severity);
    const patchedVersions = advisory.patched_versions ? [advisory.patched_versions] : undefined;

    return {
      ecosystem: "npm",
      packageName,
      severity,
      advisoryId: index + 1,
      title: advisory.title ?? packageName,
      vulnerableVersions: advisory.vulnerable_versions ?? "*",
      fixAvailable: advisory.fix_available === true || advisory.fix_available === "true",
      patchedVersions,
    } satisfies AuditFinding;
  });
}