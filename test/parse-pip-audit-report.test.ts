import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parsePipAuditReport } from "../src/audit/parsePipAuditReport";

const FIXTURE_PATH = join(__dirname, "fixtures", "pip-audit-report.json");

describe("parsePipAuditReport", () => {
  it("parses the fixture into AuditFindings with ecosystem pip", () => {
    const output = readFileSync(FIXTURE_PATH, "utf8");
    const findings = parsePipAuditReport(output);

    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.ecosystem).toBe("pip");
    }
  });

  it("emits one finding per vuln, not per package", () => {
    const output = readFileSync(FIXTURE_PATH, "utf8");
    const findings = parsePipAuditReport(output);

    // Fixture has: Pillow (1 vuln) + requests (2 vulns) + urllib3 (0 vulns) = 3 findings
    expect(findings).toHaveLength(3);
  });

  it("sets fixAvailable=true when fix_versions is non-empty", () => {
    const output = readFileSync(FIXTURE_PATH, "utf8");
    const findings = parsePipAuditReport(output);

    const pillowFinding = findings.find((f) => f.packageName === "Pillow");
    expect(pillowFinding?.fixAvailable).toBe(true);
    expect(pillowFinding?.patchedVersions).toContain("9.0.1");
  });

  it("uses the advisory ID as advisoryId", () => {
    const output = readFileSync(FIXTURE_PATH, "utf8");
    const findings = parsePipAuditReport(output);

    const pillowFinding = findings.find((f) => f.packageName === "Pillow");
    expect(pillowFinding?.advisoryId).toBe("GHSA-56pw-mpj4-fxww");
  });

  it("skips packages with no vulns", () => {
    const output = readFileSync(FIXTURE_PATH, "utf8");
    const findings = parsePipAuditReport(output);

    const urllib3Findings = findings.filter((f) => f.packageName === "urllib3");
    expect(urllib3Findings).toHaveLength(0);
  });

  it("throws when the output is not a JSON array", () => {
    expect(() => parsePipAuditReport('{"not": "an array"}')).toThrow("pip-audit");
  });
});
