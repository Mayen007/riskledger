import { handlePullRequest } from "../src/commands/runAuditWorkflow";
import { classify } from "../src/classify/classify";
import { postRiskComment } from "../src/actions/postRiskComment";
import { openPatchPR } from "../src/actions/openPatchPR";
import { runAuditNpm } from "../src/audit/runAuditNpm";

jest.mock("../src/audit/runAuditNpm", () => ({
  runAuditNpm: jest.fn(),
}));

jest.mock("../src/audit/runAuditPip", () => ({
  runAuditPip: jest.fn().mockResolvedValue([]),
}));

jest.mock("../src/classify/loadPolicy", () => ({
  loadPolicy: jest.fn().mockResolvedValue({
    autoPatch: { minSeverity: "low", maxSeverity: "moderate" },
    autoMergePatchLevel: false,
    acceptedRisks: [],
  }),
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

jest.mock("node:fs/promises", () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  mkdir: jest.fn().mockResolvedValue(undefined),
}));

// Mock writeStatusBadge so badge/stats writes don't touch the filesystem.
jest.mock("../src/actions/writeStatusBadge", () => ({
  writeStatusBadge: jest.fn().mockResolvedValue(undefined),
}));

// Mock simple-git used by commitBadge so no real git operations run.
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

jest.mock("../src/audit/detectEcosystems", () => ({
  detectEcosystems: jest.fn().mockResolvedValue(["npm"]),
}));

const mockedRunAuditNpm = jest.mocked(runAuditNpm);
const mockedOpenPatchPR = jest.mocked(openPatchPR);
const mockedPostRiskComment = jest.mocked(postRiskComment);
const mockedClassify = jest.mocked(classify);

function createContext(changedFiles: string[] = []) {
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
        head: { ref: "feature-branch", sha: "abc1234" },
      },
    },
    octokit: {
      rest: {
        pulls: {
          create: jest.fn(),
          listFiles: jest.fn().mockResolvedValue({
            data: changedFiles.map((filename) => ({ filename })),
          }),
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
  };
}

describe("policy-file PR guard", () => {
  beforeEach(() => {
    mockedRunAuditNpm.mockReset();
    mockedOpenPatchPR.mockReset();
    mockedPostRiskComment.mockReset();
    mockedClassify.mockReset();
  });

  it("posts a human-review comment and skips audit when PR touches .security-policy.json", async () => {
    const context = createContext([".security-policy.json", "README.md"]);

    await handlePullRequest(context);

    expect(context.octokit.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "owner",
        repo: "repo",
        issue_number: 42,
        body: expect.stringContaining("Policy change detected"),
      }),
    );
    expect(mockedClassify).not.toHaveBeenCalled();
    expect(mockedOpenPatchPR).not.toHaveBeenCalled();
    expect(mockedPostRiskComment).not.toHaveBeenCalled();
    expect(mockedRunAuditNpm).not.toHaveBeenCalled();
  });

  it("proceeds with normal audit when PR does not touch .security-policy.json", async () => {
    const context = createContext(["src/index.ts", "package.json"]);

    mockedRunAuditNpm.mockResolvedValue([]);
    mockedClassify.mockReturnValue([]);

    await handlePullRequest(context);

    // Guard comment must NOT be posted
    expect(context.octokit.rest.issues.createComment).not.toHaveBeenCalled();
    // Audit runs normally
    expect(mockedRunAuditNpm).toHaveBeenCalled();
  });

  it("is not fooled by a file that merely contains the policy filename in its path", async () => {
    // e.g. docs/.security-policy.json.backup should NOT trigger the guard
    const context = createContext(["docs/.security-policy.json.backup"]);

    mockedRunAuditNpm.mockResolvedValue([]);
    mockedClassify.mockReturnValue([]);

    await handlePullRequest(context);

    expect(context.octokit.rest.issues.createComment).not.toHaveBeenCalled();
  });
});
