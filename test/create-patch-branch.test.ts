import { EventEmitter } from "node:events";

import { createPatchBranch } from "../src/actions/createPatchBranch";
import { runAuditNpm } from "../src/audit/runAuditNpm";
import { findManifestDirectories } from "../src/audit/detectEcosystems";
import simpleGit from "simple-git";

jest.mock("cross-spawn", () => jest.fn());
jest.mock("../src/audit/runAuditNpm", () => ({
  runAuditNpm: jest.fn(),
}));
jest.mock("../src/audit/runAuditPip", () => ({
  runAuditPip: jest.fn().mockResolvedValue([]),
}));
jest.mock("../src/audit/detectEcosystems", () => ({
  findManifestDirectories: jest.fn(),
}));

jest.mock("simple-git", () => {
  const git = {
    env: jest.fn(),
    listRemote: jest.fn().mockResolvedValue(""),
    fetch: jest.fn().mockResolvedValue(undefined),
    checkoutBranch: jest.fn().mockResolvedValue(undefined),
    checkoutLocalBranch: jest.fn().mockResolvedValue(undefined),
    add: jest.fn().mockResolvedValue(undefined),
    status: jest.fn().mockResolvedValue({ staged: ["package-lock.json"] }),
    addConfig: jest.fn().mockResolvedValue(undefined),
    commit: jest.fn().mockResolvedValue(undefined),
    raw: jest.fn().mockResolvedValue(undefined),
    push: jest.fn().mockResolvedValue(undefined),
  };
  git.env.mockReturnValue(git);
  return { default: jest.fn(() => git), __esModule: true };
});

const mockedSpawn = jest.mocked(require("cross-spawn"));
const mockedRunAuditNpm = jest.mocked(runAuditNpm);
const mockedFindManifestDirectories = jest.mocked(findManifestDirectories);
const mockedGit = jest.mocked(simpleGit)() as unknown as Record<string, jest.Mock>;

describe("createPatchBranch", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFindManifestDirectories.mockResolvedValue({ npm: ["/repo"], pip: [] });
    mockedRunAuditNpm.mockResolvedValue([]);
    mockedSpawn.mockImplementation(() => {
      const child = new EventEmitter();
      process.nextTick(() => child.emit("close", 0));
      return child as never;
    });
  });

  it("applies npm fixes, verifies the advisory is gone, and pushes the patch branch", async () => {
    const patchable = [
      {
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
      },
    ];

    await createPatchBranch(
      "C:/temp/riskledger",
      "https://github.com/owner/repo.git",
      "ghs_secret",
      { npm: ["/repo"], pip: [] },
      patchable,
    );

    expect(mockedSpawn).toHaveBeenCalledWith(
      "npm.cmd",
      ["audit", "fix"],
      expect.objectContaining({ cwd: "/repo" }),
    );
    expect(mockedGit.checkoutLocalBranch).toHaveBeenCalledWith("riskledger/patches");
    expect(mockedGit.commit).toHaveBeenCalledWith("chore(riskledger): patch dependency vulnerabilities");
    expect(mockedGit.raw).toHaveBeenCalledWith([
      "-c",
      "credential.helper=",
      "push",
      expect.stringContaining("x-access-token:ghs_secret@"),
      "riskledger/patches",
    ]);
  });

  it("continues an existing remote patch branch", async () => {
    mockedGit.listRemote.mockResolvedValue("abc123\trefs/heads/riskledger/patches\n");

    await createPatchBranch(
      "C:/temp/riskledger",
      "https://github.com/owner/repo.git",
      "ghs_secret",
      { npm: [], pip: [] },
      [],
    );

    expect(mockedGit.fetch).toHaveBeenCalledWith("origin", "riskledger/patches");
    expect(mockedGit.checkoutBranch).toHaveBeenCalledWith(
      "riskledger/patches",
      "origin/riskledger/patches",
    );
    expect(mockedGit.checkoutLocalBranch).not.toHaveBeenCalled();
  });
});
