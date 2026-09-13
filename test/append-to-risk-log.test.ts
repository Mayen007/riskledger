import { appendToRiskLog } from "../src/actions/appendToRiskLog";

describe("appendToRiskLog", () => {
  it("writes a complete accepted-risk audit entry", () => {
    expect(appendToRiskLog("", {
      cve: "GHSA-test",
      reason: "Not applicable",
      decidedBy: "alice",
    })).toContain("advisory: GHSA-test");
    expect(appendToRiskLog("", {
      cve: "GHSA-test",
      reason: "Not applicable",
      decidedBy: "alice",
    })).toContain("decidedBy: alice");
  });

  it("rejects incomplete accepted-risk entries", () => {
    expect(() => appendToRiskLog("", {
      cve: "",
      reason: "",
      decidedBy: "",
    })).toThrow("cve, reason, and decidedBy");
  });
});