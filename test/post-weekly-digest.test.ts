import {
  postWeeklyDigest,
  buildDigestBody,
  formatDigestDate,
  type IssueWriter,
} from "../src/actions/postWeeklyDigest";
import type { DigestStats } from "../src/shared/computeDigestStats";

const FIXED_DATE = new Date("2026-08-11T09:00:00Z");

const zeroStats: DigestStats = { patchable: 0, needsReview: 0, acceptedRisk: 0, total: 0 };
const mixedStats: DigestStats = { patchable: 2, needsReview: 1, acceptedRisk: 3, total: 6 };

describe("formatDigestDate", () => {
  it("formats a UTC date as YYYY-MM-DD", () => {
    expect(formatDigestDate(FIXED_DATE)).toBe("2026-08-11");
  });
});

describe("buildDigestBody", () => {
  it("includes the date in the heading", () => {
    const body = buildDigestBody(zeroStats, FIXED_DATE);
    expect(body).toContain("2026-08-11");
  });

  it("shows a clean status line when there are no open findings", () => {
    const body = buildDigestBody(zeroStats, FIXED_DATE);
    expect(body).toContain("No open vulnerabilities");
  });

  it("shows the open count when findings exist", () => {
    // mixedStats: patchable=2 + needsReview=1 = 3 open
    const body = buildDigestBody(mixedStats, FIXED_DATE);
    expect(body).toContain("3 open");
  });

  it("includes a markdown table with all four rows", () => {
    const body = buildDigestBody(mixedStats, FIXED_DATE);
    expect(body).toContain("Auto-patchable");
    expect(body).toContain("Needs review");
    expect(body).toContain("Accepted risk");
    expect(body).toContain("Total findings");
  });

  it("renders correct counts in the table", () => {
    const body = buildDigestBody(mixedStats, FIXED_DATE);
    expect(body).toContain("| 🔧 Auto-patchable | 2 |");
    expect(body).toContain("| 👀 Needs review | 1 |");
    expect(body).toContain("| ✅ Accepted risk | 3 |");
    expect(body).toContain("| 📦 Total findings | 6 |");
  });
});

describe("postWeeklyDigest", () => {
  let mockCreate: jest.Mock;
  let issues: IssueWriter;

  beforeEach(() => {
    mockCreate = jest.fn().mockResolvedValue({ data: { number: 42 } });
    issues = { create: mockCreate };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("creates exactly one issue", async () => {
    await postWeeklyDigest(issues, { owner: "acme", repo: "myapp" }, zeroStats, FIXED_DATE);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("posts to the correct owner/repo", async () => {
    await postWeeklyDigest(issues, { owner: "acme", repo: "myapp" }, zeroStats, FIXED_DATE);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ owner: "acme", repo: "myapp" }),
    );
  });

  it("uses the date in the issue title", async () => {
    await postWeeklyDigest(issues, { owner: "acme", repo: "myapp" }, zeroStats, FIXED_DATE);
    const { title } = mockCreate.mock.calls[0][0] as { title: string };
    expect(title).toContain("2026-08-11");
    expect(title).toContain("RiskLedger Weekly Security Digest");
  });

  it("applies the 'security' label", async () => {
    await postWeeklyDigest(issues, { owner: "acme", repo: "myapp" }, zeroStats, FIXED_DATE);
    const { labels } = mockCreate.mock.calls[0][0] as { labels: string[] };
    expect(labels).toContain("security");
  });

  it("includes the stats counts in the issue body", async () => {
    await postWeeklyDigest(issues, { owner: "acme", repo: "myapp" }, mixedStats, FIXED_DATE);
    const { body } = mockCreate.mock.calls[0][0] as { body: string };
    expect(body).toContain("| 🔧 Auto-patchable | 2 |");
    expect(body).toContain("| 👀 Needs review | 1 |");
  });
});
