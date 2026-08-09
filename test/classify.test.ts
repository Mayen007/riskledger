import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseNpmAuditReport } from "../src/audit/parseNpmAuditReport";
import { classify } from "../src/classify/classify";

describe("classify", () => {
  it("routes patchable findings inside the auto-patch window", () => {
    const fixturePath = join(__dirname, "fixtures", "npm-audit-report.json");
    const findings = parseNpmAuditReport(readFileSync(fixturePath, "utf8"));

    const result = classify(findings, {
      autoPatch: {
        minSeverity: "low",
        maxSeverity: "moderate",
      },
    });

    expect(result).toEqual([
      {
        finding: findings[0],
        decision: "patchable",
        reason: "A fix is available and the severity falls within the auto-patch window.",
      },
      {
        finding: findings[1],
        decision: "needs-review",
        reason: "A fix exists, but the severity is outside the auto-patch window.",
      },
    ]);
  });

  it("routes a finding to accepted-risk when its advisoryId matches a policy entry", () => {
    const finding = {
      ecosystem: "npm" as const,
      packageName: "left-pad",
      severity: "moderate" as const,
      advisoryId: "CVE-2023-1234",
      title: "Prototype pollution",
      vulnerableVersions: "<1.3.0",
      fixAvailable: true,
    };

    const result = classify([finding], {
      autoPatch: { minSeverity: "low", maxSeverity: "moderate" },
      acceptedRisks: [
        { cve: "CVE-2023-1234", reason: "Not applicable to this app.", decidedBy: "alice" },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.decision).toBe("accepted-risk");
    expect(result[0]?.reason).toBe("Not applicable to this app.");
  });
});