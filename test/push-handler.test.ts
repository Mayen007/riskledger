import registerApp from "../src/app";

jest.mock("../src/commands/runAuditWorkflow", () => ({
  handlePush: jest.fn(),
  handlePullRequest: jest.fn(),
  CheckoutError: class CheckoutError extends Error {},
}));

jest.mock("../src/commands/handleIssueComment", () => ({
  handleIssueComment: jest.fn(),
}));

jest.mock("../src/commands/scheduleWeeklyDigest", () => ({
  scheduleWeeklyDigest: jest.fn(),
}));

import { handlePush } from "../src/commands/runAuditWorkflow";
const mockedHandlePush = jest.mocked(handlePush);

describe("push handler", () => {
  afterEach(() => jest.clearAllMocks());

  it("registers a push handler", () => {
    const app = {
      on: jest.fn(),
      log: { info: jest.fn() },
      expressApp: { get: jest.fn() },
    } as { on: jest.Mock; log: { info: jest.Mock }; expressApp: { get: jest.Mock } };

    registerApp(app as never);

    expect(app.on).toHaveBeenCalledWith("push", expect.any(Function));
    expect(app.on).toHaveBeenCalledWith("pull_request.opened", expect.any(Function));
    expect(app.on).toHaveBeenCalledWith("issue_comment.created", expect.any(Function));
    expect(app.expressApp.get).toHaveBeenCalledWith("/", expect.any(Function));
  });

  it("skips handlePush when head_commit message starts with chore(riskledger):", async () => {
    const handlers: Record<string, (ctx: unknown) => Promise<void>> = {};
    const app = {
      on: jest.fn((event: string, handler: (ctx: unknown) => Promise<void>) => {
        handlers[event] = handler;
      }),
      log: { info: jest.fn(), warn: jest.fn() },
      expressApp: { get: jest.fn() },
    };

    registerApp(app as never);

    const fakeContext = {
      payload: {
        repository: { full_name: "owner/repo" },
        ref: "refs/heads/main",
        head_commit: { message: "chore(riskledger): update security badge" },
      },
    };

    await handlers["push"]!(fakeContext);

    expect(mockedHandlePush).not.toHaveBeenCalled();
    expect(app.log.info).toHaveBeenCalledWith(
      { repository: "owner/repo" },
      "Skipping push triggered by RiskLedger bot commit",
    );
  });
});