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
});