import type { AuditFinding, AuditSeverity } from "../shared/types";

interface NpmAuditMetadata {
  vulnerabilities?: Record<string, { severity?: string }>;
}

interface NpmAuditViaEntry {
  source?: number;
  url?: string;
  title?: string;
  severity?: string;
}

interface NpmAuditAdvisory {
  severity?: string;
  title?: string;
  vulnerable_versions?: string;
  patched_versions?: string;
  fix_available?: boolean | string | { name?: string; version?: string; isSemVerMajor?: boolean };
  /** npm audit v2: list of root advisories this vulnerability comes from. */
  via?: Array<NpmAuditViaEntry | string>;
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

/**
 * Extracts a stable advisory identifier from the `via` array.
 *
 * Priority:
 *  1. GHSA or CVE ID parsed from a GitHub advisory URL (most human-readable).
 *  2. Numeric npm advisory source ID.
 *  3. Falls back to the array index (legacy v1 output with no `via`).
 */
function extractAdvisoryId(via: Array<NpmAuditViaEntry | string> | undefined, fallback: number): string | number {
  if (!via) {
    return fallback;
  }

  for (const entry of via) {
    if (typeof entry === "object" && entry.url) {
      // e.g. https://github.com/advisories/GHSA-xxxx-yyyy-zzzz
      //      https://www.npmjs.com/advisories/12345
      const ghsaMatch = /\/(GHSA-[a-z0-9-]+)$/i.exec(entry.url);
      if (ghsaMatch?.[1]) {
        return ghsaMatch[1];
      }

      const cveMatch = /(CVE-\d{4}-\d+)/i.exec(entry.url);
      if (cveMatch?.[1]) {
        return cveMatch[1];
      }

      if (typeof entry.source === "number") {
        return entry.source;
      }
    }
  }

  return fallback;
}

function extractAdvisoryUrl(via: Array<NpmAuditViaEntry | string> | undefined): string | undefined {
  return via?.find((entry): entry is NpmAuditViaEntry => typeof entry === "object" && typeof entry.url === "string")?.url;
}

export function parseNpmAuditReport(output: string): AuditFinding[] {
  const report = JSON.parse(output) as NpmAuditReport;
  const vulnerabilities = report.vulnerabilities ?? {};

  return Object.entries(vulnerabilities).map(([packageName, advisory], index) => {
    const severity = toSeverity(advisory.severity ?? report.metadata?.vulnerabilities?.[packageName]?.severity);
    const patchedVersions = advisory.patched_versions ? [advisory.patched_versions] : undefined;
    const advisoryId = extractAdvisoryId(advisory.via, index + 1);
    const advisoryUrl = extractAdvisoryUrl(advisory.via);
    const fixInfo = typeof advisory.fix_available === "object" && advisory.fix_available !== null &&
      typeof advisory.fix_available.name === "string" && typeof advisory.fix_available.version === "string"
      ? [{ name: advisory.fix_available.name, version: advisory.fix_available.version }]
      : undefined;
    const upgradeType = typeof advisory.fix_available === "object" && advisory.fix_available?.isSemVerMajor
      ? "major" as const
      : "compatible" as const;

    return {
      ecosystem: "npm",
      packageName,
      severity,
      advisoryId,
      title: advisory.title ?? packageName,
      vulnerableVersions: advisory.vulnerable_versions ?? "*",
      fixAvailable:
        advisory.fix_available === true ||
        advisory.fix_available === "true" ||
        (typeof advisory.fix_available === "object" && advisory.fix_available !== null),
      ...(fixInfo ? { fixInfo } : {}),
      ...(typeof advisory.fix_available === "object" && advisory.fix_available !== null ? { upgradeType } : {}),
      patchedVersions,
      ...(advisoryUrl ? { advisoryUrl } : {}),
    } satisfies AuditFinding;
  });
}
