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

type PullRequestOpenedPayload = {
  action: "opened";
  number: number;
  pull_request: {
    number: number;
    head: { ref: string };
  };
  repository: {
    full_name: string;
    name: string;
    owner: { login: string };
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
      },
      ref: `refs/heads/${payload.pull_request.head.ref}`,
      pull_request: {
        number: payload.pull_request.number,
        head: { ref: payload.pull_request.head.ref },
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

    await handlePullRequest(context, process.cwd());

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

    await handlePullRequest(context, process.cwd());

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

    await handlePullRequest(context, process.cwd());

    expect(mockedOpenPatchPR).not.toHaveBeenCalled();
    expect(mockedPostRiskComment).not.toHaveBeenCalled();
  });
});
