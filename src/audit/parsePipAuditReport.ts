import type { AuditFinding } from "../shared/types";

interface PipAuditVuln {
  id?: string;
  fix_versions?: string[];
  description?: string;
  aliases?: string[];
}

interface PipAuditPackage {
  name?: string;
  version?: string;
  vulns?: PipAuditVuln[];
}

/**
 * Parses `pip-audit --format=json` output into the shared `AuditFinding[]` shape.
 *
 * pip-audit reports one entry per package; each entry may have zero or more vulns.
 * We emit one `AuditFinding` per vuln (not per package) to match the npm shape.
 *
 * Severity is not part of pip-audit's JSON output — we default to "moderate" and
 * let the classifier's policy window decide routing. A future integration with
 * the OSV API could enrich this with real CVSS severity.
 */
export function parsePipAuditReport(output: string): AuditFinding[] {
  const packages = JSON.parse(output) as PipAuditPackage[];

  if (!Array.isArray(packages)) {
    throw new Error("pip-audit: expected a JSON array at root");
  }

  const findings: AuditFinding[] = [];

  for (const pkg of packages) {
    const packageName = pkg.name ?? "unknown";
    const vulns = pkg.vulns ?? [];

    for (const vuln of vulns) {
      const advisoryId = vuln.id ?? `pip-unknown-${packageName}`;
      const fixAvailable = Array.isArray(vuln.fix_versions) && vuln.fix_versions.length > 0;
      const patchedVersions = fixAvailable ? (vuln.fix_versions as string[]) : undefined;

      findings.push({
        ecosystem: "pip",
        packageName,
        severity: "moderate",
        advisoryId,
        title: vuln.description ? vuln.description.slice(0, 120) : advisoryId,
        vulnerableVersions: `<${patchedVersions?.[0] ?? "unknown"}`,
        fixAvailable,
        patchedVersions,
      } satisfies AuditFinding);
    }
  }

  return findings;
}
