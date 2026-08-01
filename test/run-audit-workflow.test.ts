import { handlePullRequest, handlePush } from "../src/commands/runAuditWorkflow";
import { classify } from "../src/classify/classify";
import { openPatchPR } from "../src/actions/openPatchPR";
import { postRiskComment } from "../src/actions/postRiskComment";
import { runAuditNpm } from "../src/audit/runAuditNpm";
import { readFile, writeFile } from "node:fs/promises";

jest.mock("../src/audit/runAuditNpm", () => ({
  runAuditNpm: jest.fn(),
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
      },
      ref: "refs/heads/main",
      pull_request: {
        number: 42,
        head: { ref: "main" },
      },
    },
    octokit: {
      rest: {
        pulls: {
          create: jest.fn(),
        },
        issues: {
          createComment: jest.fn(),
        },
      },
    },
    log: {
      info: jest.fn(),
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

    await handlePush(context, process.cwd());

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

    await handlePullRequest(context, process.cwd());

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
});