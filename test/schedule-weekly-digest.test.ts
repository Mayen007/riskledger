import { scheduleWeeklyDigest, runDigestForAllInstallations } from "../src/commands/scheduleWeeklyDigest";
import { postWeeklyDigest } from "../src/actions/postWeeklyDigest";
import { postOrgSummary } from "../src/actions/postOrgSummary";
import { schedule } from "node-cron";

jest.mock("node-cron", () => ({
  schedule: jest.fn(),
}));

jest.mock("../src/actions/postWeeklyDigest", () => ({
  postWeeklyDigest: jest.fn(),
}));

jest.mock("../src/actions/postOrgSummary", () => ({
  postOrgSummary: jest.fn(),
}));

const mockedSchedule = jest.mocked(schedule);
const mockedPostWeeklyDigest = jest.mocked(postWeeklyDigest);
const mockedPostOrgSummary = jest.mocked(postOrgSummary);

describe("scheduleWeeklyDigest", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("schedules cron with default schedule when DIGEST_CRON is not set", () => {
    delete process.env["DIGEST_CRON"];
    const app = {
      log: { info: jest.fn(), error: jest.fn() },
    } as never;

    scheduleWeeklyDigest(app);

    expect(mockedSchedule).toHaveBeenCalledWith(
      "0 9 * * 1",
      expect.any(Function),
      { timezone: "UTC" },
    );
  });

  it("schedules cron with custom schedule when DIGEST_CRON is set", () => {
    process.env["DIGEST_CRON"] = "0 12 * * 5";
    const app = {
      log: { info: jest.fn(), error: jest.fn() },
    } as never;

    scheduleWeeklyDigest(app);

    expect(mockedSchedule).toHaveBeenCalledWith(
      "0 12 * * 5",
      expect.any(Function),
      { timezone: "UTC" },
    );
  });

  it("skips scheduling when DIGEST_CRON is empty", () => {
    process.env["DIGEST_CRON"] = "";
    const app = {
      log: { info: jest.fn(), error: jest.fn() },
    } as never;

    scheduleWeeklyDigest(app);

    expect(mockedSchedule).not.toHaveBeenCalled();
  });
});

describe("runDigestForAllInstallations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("iterates installations and posts digests for repositories with valid stats.json", async () => {
    const stats = {
      patchable: 1,
      needsReview: 2,
      acceptedRisk: 0,
      total: 3,
      updatedAt: "2026-08-12T00:00:00.000Z",
    };
    const encodedStats = Buffer.from(JSON.stringify(stats)).toString("base64");

    const installOctokit = {
      paginate: jest.fn().mockResolvedValue([
        { owner: { login: "user1" }, name: "repo-with-stats" },
        { owner: { login: "user1" }, name: "repo-without-stats" },
      ]),
      rest: {
        apps: { listReposAccessibleToInstallation: jest.fn() },
        repos: {
          getContent: jest.fn().mockImplementation(({ repo }) => {
            if (repo === "repo-with-stats") {
              return Promise.resolve({ data: { content: encodedStats } });
            }
            return Promise.reject(new Error("Not found"));
          }),
        },
        issues: { create: jest.fn() },
      },
    };

    const appOctokit = {
      paginate: jest.fn().mockResolvedValue([{ id: 101 }]),
      rest: {
        apps: { listInstallations: jest.fn() },
      },
    };

    const app = {
      auth: jest.fn().mockImplementation((installationId?: number) => {
        if (installationId) return Promise.resolve(installOctokit);
        return Promise.resolve(appOctokit);
      }),
      log: { info: jest.fn(), error: jest.fn() },
    } as never;

    await runDigestForAllInstallations(app);

    expect(mockedPostWeeklyDigest).toHaveBeenCalledTimes(1);
    expect(mockedPostWeeklyDigest).toHaveBeenCalledWith(
      installOctokit.rest.issues,
      { owner: "user1", repo: "repo-with-stats" },
      stats,
    );
    expect(mockedPostOrgSummary).not.toHaveBeenCalled();
  });

  it("posts an organization-wide summary when an installation has multiple audited repositories", async () => {
    const stats1 = { patchable: 1, needsReview: 0, acceptedRisk: 0, total: 1, updatedAt: "2026-08-12T00:00:00.000Z" };
    const stats2 = { patchable: 0, needsReview: 1, acceptedRisk: 1, total: 2, updatedAt: "2026-08-12T00:00:00.000Z" };

    const installOctokit = {
      paginate: jest.fn().mockResolvedValue([
        { owner: { login: "my-org" }, name: "repo-1" },
        { owner: { login: "my-org" }, name: "repo-2" },
      ]),
      rest: {
        apps: { listReposAccessibleToInstallation: jest.fn() },
        repos: {
          getContent: jest.fn().mockImplementation(({ repo }) => {
            const stats = repo === "repo-1" ? stats1 : stats2;
            return Promise.resolve({ data: { content: Buffer.from(JSON.stringify(stats)).toString("base64") } });
          }),
        },
        issues: { create: jest.fn() },
      },
    };

    const appOctokit = {
      paginate: jest.fn().mockResolvedValue([{ id: 101 }]),
      rest: { apps: { listInstallations: jest.fn() } },
    };

    const app = {
      auth: jest.fn().mockImplementation((installationId?: number) => {
        if (installationId) return Promise.resolve(installOctokit);
        return Promise.resolve(appOctokit);
      }),
      log: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
    } as never;

    await runDigestForAllInstallations(app);

    expect(mockedPostWeeklyDigest).toHaveBeenCalledTimes(2);
    expect(mockedPostOrgSummary).toHaveBeenCalledTimes(1);
    expect(mockedPostOrgSummary).toHaveBeenCalledWith(
      installOctokit.rest.issues,
      "my-org",
      [
        { repository: "my-org/repo-1", stats: stats1 },
        { repository: "my-org/repo-2", stats: stats2 },
      ],
    );
  });

  it("handles errors during postWeeklyDigest gracefully per repo", async () => {
    const stats = { patchable: 0, needsReview: 0, acceptedRisk: 0, total: 0, updatedAt: "2026-08-12T00:00:00.000Z" };
    const encodedStats = Buffer.from(JSON.stringify(stats)).toString("base64");

    mockedPostWeeklyDigest.mockRejectedValueOnce(new Error("API rate limit"));

    const installOctokit = {
      paginate: jest.fn().mockResolvedValue([
        { owner: { login: "user1" }, name: "failing-repo" },
      ]),
      rest: {
        apps: { listReposAccessibleToInstallation: jest.fn() },
        repos: {
          getContent: jest.fn().mockResolvedValue({ data: { content: encodedStats } }),
        },
        issues: { create: jest.fn() },
      },
    };

    const appOctokit = {
      paginate: jest.fn().mockResolvedValue([{ id: 101 }]),
      rest: { apps: { listInstallations: jest.fn() } },
    };

    const appLog = { info: jest.fn(), error: jest.fn() };
    const app = {
      auth: jest.fn().mockImplementation((installationId?: number) => {
        if (installationId) return Promise.resolve(installOctokit);
        return Promise.resolve(appOctokit);
      }),
      log: appLog,
    } as never;

    await runDigestForAllInstallations(app);

    expect(appLog.error).toHaveBeenCalledWith(
      expect.objectContaining({ repository: "user1/failing-repo" }),
      "Failed to post weekly digest for repository",
    );
  });
});
