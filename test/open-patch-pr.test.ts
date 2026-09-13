import { groupPatchableFindings, openPatchPR } from "../src/actions/openPatchPR";

describe("openPatchPR", () => {
  const finding = {
    finding: {
      ecosystem: "npm" as const,
      packageName: "left-pad",
      severity: "moderate" as const,
      advisoryId: "GHSA-test",
      title: "test advisory",
      vulnerableVersions: "<1.0.0",
      fixAvailable: true,
    },
    decision: "patchable" as const,
    reason: "safe fix",
  };

  it("updates an existing open patch PR", async () => {
    const list = jest.fn().mockResolvedValue({ data: [{ number: 17 }] });
    const update = jest.fn().mockResolvedValue({ data: { number: 17 } });
    const create = jest.fn();

    await openPatchPR(
      { list, update, create },
      { owner: "owner", repo: "repo" },
      [finding],
    );

    expect(list).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      state: "open",
      head: "owner:riskledger/patches",
      base: "main",
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "owner",
        repo: "repo",
        pull_number: 17,
      }),
    );
    expect(create).not.toHaveBeenCalled();
  });

  it("groups compatible fixes and isolates major upgrades", () => {
    const major = {
      ...finding,
      finding: {
        ...finding.finding,
        packageName: "framework",
        upgradeType: "major" as const,
      },
    };

    expect(groupPatchableFindings([finding, major])).toEqual([
      expect.objectContaining({
        branch: "riskledger/patches",
        upgradeType: "compatible",
        findings: [finding],
      }),
      expect.objectContaining({
        branch: "riskledger/patches-major-framework",
        upgradeType: "major",
        findings: [major],
      }),
    ]);
  });
});
