import { postRiskComment } from "../src/actions/postRiskComment";

describe("postRiskComment", () => {
  const finding = {
    finding: {
      ecosystem: "npm" as const,
      packageName: "left-pad",
      severity: "high" as const,
      advisoryId: "GHSA-test",
      title: "test advisory",
      vulnerableVersions: "<1.0.0",
      fixAvailable: true,
    },
    decision: "needs-review" as const,
    reason: "Requires human review.",
  };

  it("updates an existing marked comment", async () => {
    const updateComment = jest.fn().mockResolvedValue(undefined);
    const createComment = jest.fn();
    const listComments = jest.fn().mockResolvedValue({
      data: [{ id: 9, body: "old <!-- riskledger:finding:npm:GHSA-test -->", user: { type: "Bot" } }],
    });

    await postRiskComment(
      { listComments, updateComment, createComment },
      { owner: "owner", repo: "repo" },
      4,
      finding,
    );

    expect(updateComment).toHaveBeenCalledWith(expect.objectContaining({ comment_id: 9 }));
    expect(createComment).not.toHaveBeenCalled();
  });
});