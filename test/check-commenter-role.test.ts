import { checkCommenterRole } from "../src/commands/checkCommenterRole";

describe("checkCommenterRole", () => {
  it("accepts collaborators with write access", async () => {
    const octokit = {
      rest: {
        repos: {
          getCollaboratorPermissionLevel: jest.fn().mockResolvedValue({
            data: { permission: "write" },
          }),
        },
      },
    };

    await expect(checkCommenterRole(octokit, "owner", "repo", "alice")).resolves.toBe(true);
    expect(octokit.rest.repos.getCollaboratorPermissionLevel).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      username: "alice",
    });
  });

  it("rejects collaborators without write or admin access", async () => {
    const octokit = {
      rest: {
        repos: {
          getCollaboratorPermissionLevel: jest.fn().mockResolvedValue({
            data: { permission: "read" },
          }),
        },
      },
    };

    await expect(checkCommenterRole(octokit, "owner", "repo", "bob")).resolves.toBe(false);
  });
});