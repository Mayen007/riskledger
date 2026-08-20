import {
  buildOrgSummaryBody,
  computeOrgTotals,
  postOrgSummary,
  type RepoReport,
} from "../src/actions/postOrgSummary";

describe("postOrgSummary", () => {
  const sampleReports: RepoReport[] = [
    {
      repository: "my-org/reviwa",
      stats: { patchable: 1, needsReview: 2, acceptedRisk: 1, total: 4 },
    },
    {
      repository: "my-org/mkusssa",
      stats: { patchable: 0, needsReview: 0, acceptedRisk: 2, total: 2 },
    },
    {
      repository: "my-org/portfolio",
      stats: { patchable: 0, needsReview: 0, acceptedRisk: 0, total: 0 },
    },
  ];

  describe("computeOrgTotals", () => {
    it("correctly aggregates metrics across all repo reports", () => {
      const totals = computeOrgTotals(sampleReports);

      expect(totals.patchable).toBe(1);
      expect(totals.needsReview).toBe(2);
      expect(totals.acceptedRisk).toBe(3);
      expect(totals.total).toBe(6);
      expect(totals.cleanRepos).toBe(2);
      expect(totals.reposNeedingAttention).toBe(1);
    });

    it("returns zeros for empty report list", () => {
      const totals = computeOrgTotals([]);
      expect(totals.total).toBe(0);
      expect(totals.cleanRepos).toBe(0);
      expect(totals.reposNeedingAttention).toBe(0);
    });
  });

  describe("buildOrgSummaryBody", () => {
    it("includes org name, repo breakdown rows, and totals", () => {
      const testDate = new Date("2026-08-20T09:00:00Z");
      const body = buildOrgSummaryBody("my-org", sampleReports, testDate);

      expect(body).toContain("Organization: **my-org**");
      expect(body).toContain("2026-08-20");
      expect(body).toContain("| `my-org/reviwa` | 1 | 2 | 1 | 4 | ⚠️ 3 open |");
      expect(body).toContain("| `my-org/mkusssa` | 0 | 0 | 2 | 2 | ✅ Clean |");
      expect(body).toContain("| **Total (3 repos)** | **1** | **2** | **3** | **6** |");
    });
  });

  describe("postOrgSummary", () => {
    it("creates an issue in the .github repository with security label", async () => {
      const mockIssues = {
        create: jest.fn().mockResolvedValue({ id: 123 }),
      };
      const testDate = new Date("2026-08-20T09:00:00Z");

      await postOrgSummary(mockIssues, "my-org", sampleReports, testDate);

      expect(mockIssues.create).toHaveBeenCalledWith({
        owner: "my-org",
        repo: ".github",
        title: "🔒 RiskLedger Organization Security Summary — 2026-08-20",
        body: expect.stringContaining("Organization: **my-org**"),
        labels: ["security"],
      });
    });
  });
});
