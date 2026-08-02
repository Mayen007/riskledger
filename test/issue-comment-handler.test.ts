import { readFileSync } from "node:fs";
import { join } from "node:path";

import { handleIssueComment } from "../src/commands/handleIssueComment";
import { checkCommenterRole } from "../src/commands/checkCommenterRole";
import { handlePullRequest } from "../src/commands/runAuditWorkflow";

jest.mock("../src/commands/checkCommenterRole", () => ({
  checkCommenterRole: jest.fn(),
}));

jest.mock("../src/commands/runAuditWorkflow", () => ({
  handlePullRequest: jest.fn(),
}));

const mockedCheckCommenterRole = jest.mocked(checkCommenterRole);
const mockedHandlePullRequest = jest.mocked(handlePullRequest);

type IssueCommentPayload = {
  action: "created";
  comment: {
    body: string;
    user: {
      login: string;
      type: string;
    };
  };
  issue: {
    number: number;
    pull_request?: {
      url: string;
    };
  };
  repository: {
    full_name: string;
    name: string;
    owner: {
      login: string;
    };
    clone_url: string;
  };
};

function loadFixture(fileName: string): IssueCommentPayload {
  const fixturePath = join(__dirname, "fixtures", fileName);
  return JSON.parse(readFileSync(fixturePath, "utf8")) as IssueCommentPayload;
}

function createContext(payload: IssueCommentPayload) {
  return {
    payload,
    octokit: {
      rest: {
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

describe("handleIssueComment", () => {
  beforeEach(() => {
    mockedCheckCommenterRole.mockReset();
    mockedHandlePullRequest.mockReset();
  });

  it("ignores bot comments before any command parsing", async () => {
    const context = createContext(loadFixture("issue-comment.bot.json"));

    await handleIssueComment(context as never);

    expect(mockedCheckCommenterRole).not.toHaveBeenCalled();
    expect(mockedHandlePullRequest).not.toHaveBeenCalled();
  });

  it("ignores human comments that are not commands", async () => {
    const context = createContext(loadFixture("issue-comment.human-note.json"));

    await handleIssueComment(context as never);

    expect(mockedCheckCommenterRole).not.toHaveBeenCalled();
    expect(mockedHandlePullRequest).not.toHaveBeenCalled();
  });

  it("runs /recheck for authorized users after the role check passes", async () => {
    const context = createContext(loadFixture("issue-comment.recheck.json"));

    mockedCheckCommenterRole.mockResolvedValue(true);
    mockedHandlePullRequest.mockResolvedValue(undefined);

    await handleIssueComment(context as never);

    expect(mockedCheckCommenterRole).toHaveBeenCalledWith(
      context.octokit,
      "Mayen007",
      "reviwa",
      "Mayen007",
    );
    expect(mockedHandlePullRequest).toHaveBeenCalledWith(expect.any(Object));
  });
});