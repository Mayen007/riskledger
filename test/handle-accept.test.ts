import { handleAccept, parseAcceptCommand } from "../src/commands/handleAccept";
import { appendAcceptedRisk } from "../src/actions/updatePolicyFile";

jest.mock("../src/actions/updatePolicyFile", () => ({
  appendAcceptedRisk: jest.fn(),
}));

const mockedAppendAcceptedRisk = jest.mocked(appendAcceptedRisk);

function createContext(commentBody: string) {
  return {
    payload: {
      comment: { body: commentBody },
      issue: { number: 42 },
      repository: {
        owner: { login: "owner" },
        name: "repo",
      },
    },
    octokit: {
      rest: {
        issues: {
          createComment: jest.fn().mockResolvedValue({}),
        },
        repos: {
          getContent: jest.fn(),
          createOrUpdateFileContents: jest.fn(),
        },
      },
    },
  };
}

describe("parseAcceptCommand", () => {
  it("parses a valid /accept command", () => {
    const result = parseAcceptCommand("/accept GHSA-xxxx-yyyy-zzzz Only affects SSR mode");
    expect(result).toEqual({
      advisoryId: "GHSA-xxxx-yyyy-zzzz",
      reason: "Only affects SSR mode",
    });
  });

  it("parses with leading/trailing whitespace", () => {
    const result = parseAcceptCommand("  /accept CVE-2023-1234 Not applicable  ");
    expect(result).toEqual({
      advisoryId: "CVE-2023-1234",
      reason: "Not applicable",
    });
  });

  it("returns null when reason is missing", () => {
    expect(parseAcceptCommand("/accept GHSA-xxxx-yyyy-zzzz")).toBeNull();
  });

  it("returns null for a non-accept command", () => {
    expect(parseAcceptCommand("/recheck")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseAcceptCommand("")).toBeNull();
  });
});

describe("handleAccept", () => {
  beforeEach(() => {
    mockedAppendAcceptedRisk.mockReset();
  });

  it("calls appendAcceptedRisk with the parsed entry and posts a confirmation comment", async () => {
    const context = createContext("/accept GHSA-56pw-mpj4-fxww Only affects SSR mode");
    mockedAppendAcceptedRisk.mockResolvedValue(undefined);

    await handleAccept(context, "alice");

    expect(mockedAppendAcceptedRisk).toHaveBeenCalledWith(
      context.octokit.rest.repos,
      "owner",
      "repo",
      {
        cve: "GHSA-56pw-mpj4-fxww",
        reason: "Only affects SSR mode",
        decidedBy: "alice",
      },
      "alice",
    );
    expect(context.octokit.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("GHSA-56pw-mpj4-fxww"),
      }),
    );
    expect(context.octokit.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("/recheck"),
      }),
    );
  });

  it("posts a usage hint and does NOT call appendAcceptedRisk when format is invalid", async () => {
    const context = createContext("/accept GHSA-xxxx-yyyy-zzzz");

    await handleAccept(context, "alice");

    expect(mockedAppendAcceptedRisk).not.toHaveBeenCalled();
    expect(context.octokit.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.stringContaining("Invalid"),
      }),
    );
  });

  it("propagates errors from appendAcceptedRisk", async () => {
    const context = createContext("/accept GHSA-xxxx-yyyy-zzzz A valid reason");
    mockedAppendAcceptedRisk.mockRejectedValue(new Error("API error"));

    await expect(handleAccept(context, "alice")).rejects.toThrow("API error");
  });
});
