import { dedup } from "../src/classify/dedup";
import type { AuditFinding } from "../src/shared/types";

function makeFinding(overrides: Partial<AuditFinding> & { packageName: string; advisoryId: string | number }): AuditFinding {
  return {
    ecosystem: "npm",
    severity: "moderate",
    title: overrides.packageName,
    vulnerableVersions: "<1.0.0",
    fixAvailable: true,
    ...overrides,
  };
}

describe("dedup", () => {
  it("returns findings unchanged when all advisory IDs are distinct", () => {
    const findings = [
      makeFinding({ packageName: "pkg-a", advisoryId: "GHSA-aaaa-1111-bbbb" }),
      makeFinding({ packageName: "pkg-b", advisoryId: "GHSA-cccc-2222-dddd" }),
    ];

    const result = dedup(findings);

    expect(result).toHaveLength(2);
    expect(result[0]?.packageName).toBe("pkg-a");
    expect(result[1]?.packageName).toBe("pkg-b");
  });

  it("collapses two packages with the same advisory ID into one finding", () => {
    const findings = [
      makeFinding({ packageName: "pkg-a", advisoryId: "GHSA-aaaa-1111-bbbb", severity: "moderate" }),
      makeFinding({ packageName: "pkg-b", advisoryId: "GHSA-aaaa-1111-bbbb", severity: "moderate" }),
    ];

    const result = dedup(findings);

    expect(result).toHaveLength(1);
    expect(result[0]?.affectedPackages).toEqual(["pkg-a", "pkg-b"]);
  });

  it("escalates severity to the highest value across merged findings", () => {
    const findings = [
      makeFinding({ packageName: "pkg-a", advisoryId: "GHSA-aaaa-1111-bbbb", severity: "low" }),
      makeFinding({ packageName: "pkg-b", advisoryId: "GHSA-aaaa-1111-bbbb", severity: "critical" }),
    ];

    const result = dedup(findings);

    expect(result).toHaveLength(1);
    expect(result[0]?.severity).toBe("critical");
  });

  it("preserves insertion order for unique advisories", () => {
    const findings = [
      makeFinding({ packageName: "first", advisoryId: "GHSA-1111-aaaa-bbbb" }),
      makeFinding({ packageName: "second", advisoryId: "GHSA-2222-cccc-dddd" }),
      makeFinding({ packageName: "third", advisoryId: "GHSA-3333-eeee-ffff" }),
    ];

    const result = dedup(findings);

    expect(result.map((f) => f.packageName)).toEqual(["first", "second", "third"]);
  });

  it("populates affectedPackages for non-merged findings too", () => {
    const findings = [makeFinding({ packageName: "solo", advisoryId: "GHSA-solo-0000-0000" })];

    const result = dedup(findings);

    expect(result[0]?.affectedPackages).toEqual(["solo"]);
  });
});
