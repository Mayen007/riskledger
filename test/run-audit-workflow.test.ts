import { handlePullRequest, handlePush } from "../src/commands/runAuditWorkflow";
import { classify } from "../src/classify/classify";
import { openPatchPR } from "../src/actions/openPatchPR";
import { postRiskComment } from "../src/actions/postRiskComment";
import { runAuditNpm } from "../src/audit/runAuditNpm";
import { runAuditPip } from "../src/audit/runAuditPip";
import { readFile, writeFile } from "node:fs/promises";

jest.mock("../src/audit/runAuditNpm", () => ({
  runAuditNpm: jest.fn(),
}));

jest.mock("../src/audit/runAuditPip", () => ({
  runAuditPip: jest.fn().mockResolvedValue([]),
}));

jest.mock("../src/classify/dedup", () => ({
  dedup: jest.fn((findings: unknown[]) => findings),
}));

jest.mock("../src/actions/openPatchPR", () => ({
  openPatchPR: jest.fn(),
}));

jest.mock("../src/actions/postRiskComment", () => ({
  postRiskComment: jest.fn(),
}));

jest.mock("../src/classify/classify", () => ({
  classify: jest.fn(),
}));

jest.mock("../src/classify/loadPolicy", () => ({
  loadPolicy: jest.fn().mockResolvedValue({
    autoPatch: { minSeverity: "low", maxSeverity: "moderate" },
    autoMergePatchLevel: false,
    acceptedRisks: [],
  }),
}));

jest.mock("node:fs/promises", () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
}));

// Mock writeStatusBadge so badge writes don't touch the filesystem in tests.
jest.mock("../src/actions/writeStatusBadge", () => ({
  writeStatusBadge: jest.fn().mockResolvedValue(undefined),
}));

// Mock simple-git used by commitBadge so no real git operations run in tests.
jest.mock("simple-git", () => {
  const mockGit = {
    env: jest.fn(),
    addConfig: jest.fn().mockResolvedValue(undefined),
    add: jest.fn().mockResolvedValue(undefined),
    status: jest.fn().mockResolvedValue({ staged: [] }),
    commit: jest.fn().mockResolvedValue(undefined),
    push: jest.fn().mockResolvedValue(undefined),
  };
  mockGit.env.mockReturnValue(mockGit);
  return { default: jest.fn(() => mockGit), __esModule: true };
});

// Mock withRepoCheckout so tests don't actually clone — just invoke the callback
// with process.cwd(), preserving the existing test behavior.
jest.mock("../src/audit/checkoutRepo", () => ({
  withRepoCheckout: jest.fn(
    async (_options: unknown, callback: (cwd: string) => Promise<unknown>) =>
      callback(process.cwd()),
  ),
  CheckoutError: class CheckoutError extends Error {
    constructor(url: string, cause: unknown) {
      super(`Failed to clone ${url}: ${cause}`);
      this.name = "CheckoutError";
    }
  },
}));

// detectEcosystems mock: always return npm directory so runAuditNpm is called
jest.mock("../src/audit/detectEcosystems", () => ({
  detectEcosystems: jest.fn().mockResolvedValue(["npm"]),
  findManifestDirectories: jest.fn().mockResolvedValue({ npm: [process.cwd()], pip: [] }),
}));

const mockedRunAuditNpm = jest.mocked(runAuditNpm);
const mockedOpenPatchPR = jest.mocked(openPatchPR);
const mockedPostRiskComment = jest.mocked(postRiskComment);
const mockedClassify = jest.mocked(classify);
const mockedReadFile = jest.mocked(readFile);
const mockedWriteFile = jest.mocked(writeFile);

function createContext(overrides: Partial<Parameters<typeof handlePush>[0]> = {}) {
  return {
    payload: {
      repository: {
        owner: { login: "owner" },
        name: "repo",
        full_name: "owner/repo",
        clone_url: "https://github.com/owner/repo.git",
      },
      ref: "refs/heads/main",
      pull_request: {
        number: 42,
        head: { ref: "main", sha: "abc1234" },
      },
    },
    octokit: {
      rest: {
        pulls: {
          create: jest.fn(),
          listFiles: jest.fn().mockResolvedValue({ data: [] }),
        },
        issues: {
          createComment: jest.fn(),
        },
      },
      auth: jest.fn().mockResolvedValue({ token: "ghs_test" }),
    },
    log: {
      info: jest.fn(),
      warn: jest.fn(),
    },
    ...overrides,
  };
}

describe("runAuditWorkflow", () => {
  beforeEach(() => {
    mockedRunAuditNpm.mockReset();
    mockedOpenPatchPR.mockReset();
    mockedPostRiskComment.mockReset();
    mockedClassify.mockReset();
    mockedReadFile.mockReset();
    mockedWriteFile.mockReset();
  });

  it("opens a patch PR for patchable findings on push", async () => {
    const context = createContext();

    mockedRunAuditNpm.mockResolvedValue([
      {
        ecosystem: "npm",
        packageName: "left-pad",
        severity: "moderate",
        advisoryId: 1,
        title: "left-pad",
        vulnerableVersions: "<1.3.0",
        fixAvailable: true,
      },
    ]);
    mockedClassify.mockReturnValue([
      {
        finding: {
          ecosystem: "npm",
          packageName: "left-pad",
          severity: "moderate",
          advisoryId: 1,
          title: "left-pad",
          vulnerableVersions: "<1.3.0",
          fixAvailable: true,
        },
        decision: "patchable",
        reason: "A fix is available and the severity falls within the auto-patch window.",
      },
    ]);

    await handlePush(context);

    expect(mockedOpenPatchPR).toHaveBeenCalledWith(context.octokit.rest.pulls, {
      owner: "owner",
      repo: "repo",
    }, expect.any(Array));
    expect(mockedPostRiskComment).not.toHaveBeenCalled();
  });

  it("posts comments for review findings on pull requests", async () => {
    const context = createContext();

    mockedRunAuditNpm.mockResolvedValue([
      {
        ecosystem: "npm",
        packageName: "brace-expansion",
        severity: "high",
        advisoryId: 2,
        title: "brace-expansion",
        vulnerableVersions: "<2.0.1",
        fixAvailable: true,
      },
    ]);
    mockedClassify.mockReturnValue([
      {
        finding: {
          ecosystem: "npm",
          packageName: "brace-expansion",
          severity: "high",
          advisoryId: 2,
          title: "brace-expansion",
          vulnerableVersions: "<2.0.1",
          fixAvailable: true,
        },
        decision: "needs-review",
        reason: "A fix exists, but the severity is outside the auto-patch window.",
      },
    ]);
    mockedReadFile.mockResolvedValue("# Accepted risks\n");

    await handlePullRequest(context);

    expect(mockedPostRiskComment).toHaveBeenCalledWith(
      context.octokit.rest.issues,
      { owner: "owner", repo: "repo" },
      42,
      expect.objectContaining({ decision: "needs-review" }),
    );
    expect(mockedWriteFile).toHaveBeenCalledWith(
      expect.stringContaining("accepted-risks.md"),
      expect.stringContaining("brace-expansion"),
      "utf8",
    );
    expect(mockedOpenPatchPR).not.toHaveBeenCalled();
  });

  it("audits multiple discovered subdirectories and aggregates findings", async () => {
    const { findManifestDirectories } = jest.requireMock("../src/audit/detectEcosystems");
    findManifestDirectories.mockResolvedValueOnce({
      npm: ["/repo/client", "/repo/server"],
      pip: [],
    });

    const context = createContext();

    mockedRunAuditNpm
      .mockResolvedValueOnce([
        {
          ecosystem: "npm",
          packageName: "client-dep",
          severity: "moderate",
          advisoryId: 10,
          title: "client-dep vuln",
          vulnerableVersions: "<1.0.0",
          fixAvailable: true,
        },
      ])
      .mockResolvedValueOnce([
        {
          ecosystem: "npm",
          packageName: "server-dep",
          severity: "moderate",
          advisoryId: 20,
          title: "server-dep vuln",
          vulnerableVersions: "<2.0.0",
          fixAvailable: true,
        },
      ]);

    mockedClassify.mockReturnValue([
      {
        finding: {
          ecosystem: "npm",
          packageName: "client-dep",
          severity: "moderate",
          advisoryId: 10,
          title: "client-dep vuln",
          vulnerableVersions: "<1.0.0",
          fixAvailable: true,
        },
        decision: "patchable",
        reason: "Auto patchable",
      },
      {
        finding: {
          ecosystem: "npm",
          packageName: "server-dep",
          severity: "moderate",
          advisoryId: 20,
          title: "server-dep vuln",
          vulnerableVersions: "<2.0.0",
          fixAvailable: true,
        },
        decision: "patchable",
        reason: "Auto patchable",
      },
    ]);

    await handlePush(context);

    expect(mockedRunAuditNpm).toHaveBeenCalledWith("/repo/client");
    expect(mockedRunAuditNpm).toHaveBeenCalledWith("/repo/server");
    expect(mockedOpenPatchPR).toHaveBeenCalled();
  });
});