import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseNpmAuditReport } from "../src/audit/parseNpmAuditReport";

describe("parseNpmAuditReport", () => {
  it("normalizes npm audit output into findings", () => {
    const fixturePath = join(__dirname, "fixtures", "npm-audit-report.json");
    const findings = parseNpmAuditReport(readFileSync(fixturePath, "utf8"));

    expect(findings).toEqual([
      {
        ecosystem: "npm",
        packageName: "left-pad",
        severity: "moderate",
        advisoryId: 1,
        title: "Prototype pollution in left-pad",
        vulnerableVersions: "<1.3.0",
        fixAvailable: true,
        patchedVersions: [">=1.3.0"],
      },
      {
        ecosystem: "npm",
        packageName: "brace-expansion",
        severity: "high",
        advisoryId: 2,
        title: "Command injection in brace-expansion",
        vulnerableVersions: "<2.0.1",
        fixAvailable: true,
        patchedVersions: [">=2.0.1"],
      },
    ]);
  });
});