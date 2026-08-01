import { postCommandRejectionComment } from "../src/actions/postCommandRejectionComment";

describe("postCommandRejectionComment", () => {
  it("posts a comment explaining the access restriction", async () => {
    const createComment = jest.fn().mockResolvedValue({});

    await expect(
      postCommandRejectionComment(
        {
          createComment,
        },
        { owner: "owner", repo: "repo" },
        5,
        "alice",
      ),
    ).resolves.toBeDefined();

    expect(createComment).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      issue_number: 5,
      body: "@alice needs write or admin access to use /recheck or /accept on this repository.",
    });
  });
});