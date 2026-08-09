import { withRepoCheckout, CheckoutError } from "../src/audit/checkoutRepo";
import { rm, mkdtemp } from "node:fs/promises";

// Mock simple-git at the module level.
// The mock instance supports .env() chaining — .env() records its argument
// and returns the same instance so .clone() can be called on the result.
jest.mock("simple-git", () => {
  const mockClone = jest.fn();
  const mockEnv = jest.fn();
  // mockInstance must be defined before mockEnv so the return value reference works.
  const mockInstance: { clone: jest.Mock; env: jest.Mock } = {
    clone: mockClone,
    env: mockEnv,
  };
  mockEnv.mockReturnValue(mockInstance); // .env() returns the same chainable instance
  const mockFactory = jest.fn(() => mockInstance);
  (mockFactory as jest.Mock & { _mockClone: jest.Mock; _mockEnv: jest.Mock })._mockClone =
    mockClone;
  (mockFactory as jest.Mock & { _mockClone: jest.Mock; _mockEnv: jest.Mock })._mockEnv = mockEnv;
  return { default: mockFactory, __esModule: true };
});

jest.mock("node:fs/promises", () => ({
  mkdtemp: jest.fn(),
  rm: jest.fn(),
}));

import simpleGit from "simple-git";

const mockedSimpleGit = jest.mocked(simpleGit);
const mockedMkdtemp = jest.mocked(mkdtemp);
const mockedRm = jest.mocked(rm);

// Access the mock clone function through the factory mock
function getMockClone(): jest.Mock {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (mockedSimpleGit as any)._mockClone as jest.Mock;
}

// Access the mock env function through the factory mock
function getMockEnv(): jest.Mock {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (mockedSimpleGit as any)._mockEnv as jest.Mock;
}

describe("withRepoCheckout", () => {
  const FAKE_TEMP_DIR = "/tmp/riskledger-abc123";
  const CLONE_URL = "https://github.com/Mayen007/reviwa.git";
  const TOKEN = "ghs_test_installation_token";
  const REF = "main";

  beforeEach(() => {
    mockedMkdtemp.mockResolvedValue(FAKE_TEMP_DIR);
    mockedRm.mockResolvedValue(undefined);
    getMockClone().mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("clones with an authenticated URL embedding the installation token", async () => {
    await withRepoCheckout({ cloneUrl: CLONE_URL, token: TOKEN, ref: REF }, async () => undefined);

    const mockClone = getMockClone();
    expect(mockClone).toHaveBeenCalledTimes(1);
    const [calledUrl, , calledArgs] = mockClone.mock.calls[0] as [string, string, string[]];

    expect(calledUrl).toContain(`x-access-token:${TOKEN}@`);
    expect(calledUrl).toContain("github.com/Mayen007/reviwa.git");
    expect(calledArgs).toContain("-c");
    expect(calledArgs).toContain("credential.allowUnsafeCredentialHelper=true");
    expect(calledArgs).toContain("credential.helper=");
    expect(calledArgs).toContain("--depth");
    expect(calledArgs).toContain("1");
    expect(calledArgs).toContain("--branch");
    expect(calledArgs).toContain(REF);
  });

  it("sets GIT_TERMINAL_PROMPT=0, GCM_INTERACTIVE=never, and credential.helper= to prevent any interactive credential prompt", async () => {
    await withRepoCheckout({ cloneUrl: CLONE_URL, token: TOKEN, ref: REF }, async () => undefined);

    const mockEnv = getMockEnv();
    const mockClone = getMockClone();

    // .env() must have been called (exactly once, by the chained call)
    expect(mockEnv).toHaveBeenCalledTimes(1);
    const envArg = mockEnv.mock.calls[0][0] as Record<string, string>;

    // Both env vars must be present and set to the correct suppression values
    expect(envArg).toMatchObject({
      GIT_TERMINAL_PROMPT: "0",
      GCM_INTERACTIVE: "never",
    });

    // The clone args must include -c credential.allowUnsafeCredentialHelper=true
    // before -c credential.helper= (so git permits and then clears the helper)
    const [, , cloneArgs] = mockClone.mock.calls[0] as [string, string, string[]];
    const allowUnsafeIndex = cloneArgs.indexOf("credential.allowUnsafeCredentialHelper=true");
    expect(allowUnsafeIndex).toBeGreaterThan(0);
    expect(cloneArgs[allowUnsafeIndex - 1]).toBe("-c");
    const credHelperIndex = cloneArgs.indexOf("credential.helper=");
    expect(credHelperIndex).toBeGreaterThan(allowUnsafeIndex);
    expect(cloneArgs[credHelperIndex - 1]).toBe("-c");
  });

  it("passes the temp directory as cwd to the callback", async () => {
    const callbackCwd = jest.fn().mockResolvedValue("result");

    await withRepoCheckout({ cloneUrl: CLONE_URL, token: TOKEN, ref: REF }, callbackCwd);

    expect(callbackCwd).toHaveBeenCalledWith(FAKE_TEMP_DIR);
  });

  it("removes the temp directory after the callback succeeds", async () => {
    await withRepoCheckout({ cloneUrl: CLONE_URL, token: TOKEN, ref: REF }, async () => undefined);

    expect(mockedRm).toHaveBeenCalledWith(FAKE_TEMP_DIR, { recursive: true, force: true });
  });

  it("removes the temp directory even when the callback throws", async () => {
    const callbackError = new Error("callback exploded");

    await expect(
      withRepoCheckout({ cloneUrl: CLONE_URL, token: TOKEN, ref: REF }, async () => {
        throw callbackError;
      }),
    ).rejects.toThrow("callback exploded");

    expect(mockedRm).toHaveBeenCalledWith(FAKE_TEMP_DIR, { recursive: true, force: true });
  });

  it("throws CheckoutError when clone fails, and does NOT expose the token in the message", async () => {
    getMockClone().mockRejectedValue(new Error("remote: Repository not found"));

    await expect(
      withRepoCheckout({ cloneUrl: CLONE_URL, token: TOKEN, ref: REF }, async () => undefined),
    ).rejects.toMatchObject({
      name: "CheckoutError",
      message: expect.not.stringContaining(TOKEN),
    });
  });

  it("still removes the temp directory when clone fails", async () => {
    getMockClone().mockRejectedValue(new Error("authentication required"));

    await expect(
      withRepoCheckout({ cloneUrl: CLONE_URL, token: TOKEN, ref: REF }, async () => undefined),
    ).rejects.toBeInstanceOf(CheckoutError);

    expect(mockedRm).toHaveBeenCalledWith(FAKE_TEMP_DIR, { recursive: true, force: true });
  });
});
