import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { loadPolicy, DEFAULT_POLICY } from "../src/classify/loadPolicy";

const VALID_FIXTURE = join(__dirname, "fixtures", "security-policy.valid.json");
const MALFORMED_FIXTURE = join(__dirname, "fixtures", "security-policy.malformed.json");

describe("loadPolicy", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `riskledger-test-${process.pid}-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns DEFAULT_POLICY when .security-policy.json is absent", async () => {
    const policy = await loadPolicy(tmpDir);
    expect(policy).toEqual(DEFAULT_POLICY);
  });

  it("parses a valid policy file", async () => {
    const { readFileSync } = await import("node:fs");
    writeFileSync(join(tmpDir, ".security-policy.json"), readFileSync(VALID_FIXTURE));

    const policy = await loadPolicy(tmpDir);

    expect(policy.autoPatch.minSeverity).toBe("low");
    expect(policy.autoPatch.maxSeverity).toBe("high");
    expect(policy.autoMergePatchLevel).toBe(false);
    expect(policy.acceptedRisks).toHaveLength(1);
    expect(policy.acceptedRisks?.[0]?.cve).toBe("CVE-2023-1234");
    expect(policy.acceptedRisks?.[0]?.decidedBy).toBe("alice");
  });

  it("throws on a malformed policy file", async () => {
    const { readFileSync } = await import("node:fs");
    writeFileSync(join(tmpDir, ".security-policy.json"), readFileSync(MALFORMED_FIXTURE));

    await expect(loadPolicy(tmpDir)).rejects.toThrow(".security-policy.json");
  });

  it("throws when the policy file is not valid JSON", async () => {
    writeFileSync(join(tmpDir, ".security-policy.json"), "this is not json {{{");

    await expect(loadPolicy(tmpDir)).rejects.toThrow(".security-policy.json");
  });

  it("throws when an acceptedRisks entry is missing the reason field", async () => {
    writeFileSync(
      join(tmpDir, ".security-policy.json"),
      JSON.stringify({
        autoPatch: { minSeverity: "low", maxSeverity: "moderate" },
        acceptedRisks: [{ cve: "CVE-2023-9999", decidedBy: "bob" }],
      }),
    );

    await expect(loadPolicy(tmpDir)).rejects.toThrow("reason");
  });
});

describe("parsePolicy", () => {
  it("parses valid raw policy object correctly", () => {
    const raw = {
      autoPatch: { minSeverity: "moderate", maxSeverity: "critical" },
      autoMergePatchLevel: true,
      acceptedRisks: [{ cve: "CVE-2024-1111", reason: "Internal only", decidedBy: "carol" }],
    };
    const parsed = require("../src/classify/loadPolicy").parsePolicy(raw);
    expect(parsed.autoPatch.minSeverity).toBe("moderate");
    expect(parsed.autoPatch.maxSeverity).toBe("critical");
    expect(parsed.autoMergePatchLevel).toBe(true);
    expect(parsed.acceptedRisks).toHaveLength(1);
  });

  it("throws when required fields are missing", () => {
    expect(() => require("../src/classify/loadPolicy").parsePolicy({})).toThrow("autoPatch");
  });
});

describe("mergePolicies", () => {
  const { mergePolicies } = require("../src/classify/loadPolicy");

  it("returns base policy unchanged when override is undefined or null", () => {
    const base = {
      autoPatch: { minSeverity: "low" as const, maxSeverity: "moderate" as const },
      autoMergePatchLevel: false,
      acceptedRisks: [{ cve: "CVE-1", reason: "r1", decidedBy: "u1" }],
    };
    expect(mergePolicies(base)).toEqual(base);
    expect(mergePolicies(base, null)).toEqual(base);
  });

  it("overrides autoPatch and autoMergePatchLevel when specified", () => {
    const base = {
      autoPatch: { minSeverity: "low" as const, maxSeverity: "moderate" as const },
      autoMergePatchLevel: false,
      acceptedRisks: [],
    };
    const override = {
      autoPatch: { minSeverity: "moderate" as const, maxSeverity: "critical" as const },
      autoMergePatchLevel: true,
    };
    const merged = mergePolicies(base, override);
    expect(merged.autoPatch).toEqual({ minSeverity: "moderate", maxSeverity: "critical" });
    expect(merged.autoMergePatchLevel).toBe(true);
  });

  it("merges acceptedRisks and lets override take precedence on duplicate CVEs", () => {
    const base = {
      autoPatch: { minSeverity: "low" as const, maxSeverity: "moderate" as const },
      autoMergePatchLevel: false,
      acceptedRisks: [
        { cve: "CVE-ORG-1", reason: "Org reason", decidedBy: "org-admin" },
        { cve: "CVE-COMMON", reason: "Org common reason", decidedBy: "org-admin" },
      ],
    };
    const override = {
      acceptedRisks: [
        { cve: "CVE-COMMON", reason: "Repo custom reason", decidedBy: "repo-lead" },
        { cve: "CVE-REPO-1", reason: "Repo reason", decidedBy: "repo-lead" },
      ],
    };

    const merged = mergePolicies(base, override);
    expect(merged.acceptedRisks).toHaveLength(3);
    const commonEntry = merged.acceptedRisks?.find((r: { cve: string }) => r.cve === "CVE-COMMON");
    expect(commonEntry?.reason).toBe("Repo custom reason");
    expect(commonEntry?.decidedBy).toBe("repo-lead");
  });
});
