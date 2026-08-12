import { computeDigestStats } from "../src/shared/computeDigestStats";
import type { ClassifiedFinding, AuditFinding } from "../src/shared/types";

function makeFinding(
  packageName: string,
  decision: ClassifiedFinding["decision"],
): ClassifiedFinding {
  const finding: AuditFinding = {
    ecosystem: "npm",
    packageName,
    severity: "moderate",
    advisoryId: "GHSA-test-1234-abcd",
    title: "Test vulnerability",
    vulnerableVersions: "<1.0.0",
    fixAvailable: decision === "patchable",
  };
  return { finding, decision, reason: "test" };
}

describe("computeDigestStats", () => {
  it("returns all-zero stats for an empty findings array", () => {
    expect(computeDigestStats([])).toEqual({
      patchable: 0,
      needsReview: 0,
      acceptedRisk: 0,
      total: 0,
    });
  });

  it("counts each decision type correctly", () => {
    const findings: ClassifiedFinding[] = [
      makeFinding("pkg-a", "patchable"),
      makeFinding("pkg-b", "patchable"),
      makeFinding("pkg-c", "needs-review"),
      makeFinding("pkg-d", "accepted-risk"),
    ];

    expect(computeDigestStats(findings)).toEqual({
      patchable: 2,
      needsReview: 1,
      acceptedRisk: 1,
      total: 4,
    });
  });

  it("total equals patchable + needsReview + acceptedRisk", () => {
    const findings: ClassifiedFinding[] = [
      makeFinding("a", "patchable"),
      makeFinding("b", "needs-review"),
      makeFinding("c", "needs-review"),
      makeFinding("d", "accepted-risk"),
      makeFinding("e", "accepted-risk"),
      makeFinding("f", "accepted-risk"),
    ];
    const stats = computeDigestStats(findings);
    expect(stats.total).toBe(stats.patchable + stats.needsReview + stats.acceptedRisk);
  });

  it("handles findings with only one decision type", () => {
    const allPatchable = [
      makeFinding("a", "patchable"),
      makeFinding("b", "patchable"),
    ];
    expect(computeDigestStats(allPatchable)).toEqual({
      patchable: 2,
      needsReview: 0,
      acceptedRisk: 0,
      total: 2,
    });
  });
});
