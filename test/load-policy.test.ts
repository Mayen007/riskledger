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
