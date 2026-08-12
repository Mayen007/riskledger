import { readFileSync } from "node:fs";
import { join } from "node:path";

import { handlePullRequest } from "../src/commands/runAuditWorkflow";
import { classify } from "../src/classify/classify";
import { postRiskComment } from "../src/actions/postRiskComment";
import { openPatchPR } from "../src/actions/openPatchPR";
import { runAuditNpm } from "../src/audit/runAuditNpm";
import { readFile, writeFile } from "node:fs/promises";

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

// withRepoCheckout passes cwd directly to the callback — no real clone
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

// Always report npm so the audit path is exercised
jest.mock("../src/audit/detectEcosystems", () => ({
  detectEcosystems: jest.fn().mockResolvedValue(["npm"]),
}));

const mockedRunAuditNpm = jest.mocked(runAuditNpm);
const mockedOpenPatchPR = jest.mocked(openPatchPR);
const mockedPostRiskComment = jest.mocked(postRiskComment);
const mockedClassify = jest.mocked(classify);
const mockedReadFile = jest.mocked(readFile);
const mockedWriteFile = jest.mocked(writeFile);

type PullRequestOpenedPayload = {
  action: "opened";
  number: number;
  pull_request: {
    number: number;
    head: { ref: string; sha?: string };
  };
  repository: {
    full_name: string;
    name: string;
    owner: { login: string };
    clone_url: string;
  };
};

function loadFixture(fileName: string): PullRequestOpenedPayload {
  const fixturePath = join(__dirname, "fixtures", fileName);
  return JSON.parse(readFileSync(fixturePath, "utf8")) as PullRequestOpenedPayload;
}

function createContext(payload: PullRequestOpenedPayload) {
  return {
    payload: {
      repository: {
        owner: { login: payload.repository.owner.login },
        name: payload.repository.name,
        full_name: payload.repository.full_name,
        clone_url: payload.repository.clone_url,
      },
      ref: `refs/heads/${payload.pull_request.head.ref}`,
      pull_request: {
        number: payload.pull_request.number,
        head: {
          ref: payload.pull_request.head.ref,
          sha: payload.pull_request.head.sha,
        },
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
  };
}

describe("pull_request.opened handler", () => {
  beforeEach(() => {
    mockedRunAuditNpm.mockReset();
    mockedOpenPatchPR.mockReset();
    mockedPostRiskComment.mockReset();
    mockedClassify.mockReset();
    mockedReadFile.mockReset();
    mockedWriteFile.mockReset();
  });

  it("posts a risk comment and writes the risk log when a needs-review finding is present", async () => {
    const payload = loadFixture("pull-request.opened.json");
    const context = createContext(payload);

    mockedRunAuditNpm.mockResolvedValue([
      {
        ecosystem: "npm",
        packageName: "brace-expansion",
        severity: "high",
        advisoryId: 2,
        title: "brace-expansion ReDoS",
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
          title: "brace-expansion ReDoS",
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
      { owner: "Mayen007", repo: "reviwa" },
      7,
      expect.objectContaining({ decision: "needs-review" }),
    );
    expect(mockedWriteFile).toHaveBeenCalledWith(
      expect.stringContaining("accepted-risks.md"),
      expect.stringContaining("brace-expansion"),
      "utf8",
    );
    expect(mockedOpenPatchPR).not.toHaveBeenCalled();
  });

  it("does not post a comment or write the risk log when there are no findings", async () => {
    const payload = loadFixture("pull-request.opened.json");
    const context = createContext(payload);

    mockedRunAuditNpm.mockResolvedValue([]);
    mockedClassify.mockReturnValue([]);

    await handlePullRequest(context);

    expect(mockedPostRiskComment).not.toHaveBeenCalled();
    expect(mockedWriteFile).not.toHaveBeenCalled();
    expect(mockedOpenPatchPR).not.toHaveBeenCalled();
  });

  it("does not open a patch PR for patchable findings (that is the push handler's job)", async () => {
    const payload = loadFixture("pull-request.opened.json");
    const context = createContext(payload);

    mockedRunAuditNpm.mockResolvedValue([
      {
        ecosystem: "npm",
        packageName: "left-pad",
        severity: "moderate",
        advisoryId: 1,
        title: "left-pad vulnerability",
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
          title: "left-pad vulnerability",
          vulnerableVersions: "<1.3.0",
          fixAvailable: true,
        },
        decision: "patchable",
        reason: "A fix is available and the severity falls within the auto-patch window.",
      },
    ]);

    await handlePullRequest(context);

    expect(mockedOpenPatchPR).not.toHaveBeenCalled();
    expect(mockedPostRiskComment).not.toHaveBeenCalled();
  });
});
