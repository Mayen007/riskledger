import { withRepoCheckout, CheckoutError } from "../src/audit/checkoutRepo";
import { rm, mkdtemp } from "node:fs/promises";

// Mock simple-git at the module level
jest.mock("simple-git", () => {
  const mockClone = jest.fn();
  const mockInstance = { clone: mockClone };
  const mockFactory = jest.fn(() => mockInstance);
  (mockFactory as jest.Mock & { _mockClone: jest.Mock })._mockClone = mockClone;
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
    expect(calledArgs).toContain("--depth");
    expect(calledArgs).toContain("1");
    expect(calledArgs).toContain("--branch");
    expect(calledArgs).toContain(REF);
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
