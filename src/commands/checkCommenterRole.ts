export interface CommenterPermissionResponse {
  data: {
    permission: string;
  };
}

export interface CommenterRoleOctokit {
  rest: {
    repos: {
      getCollaboratorPermissionLevel: (input: {
        owner: string;
        repo: string;
        username: string;
      }) => Promise<CommenterPermissionResponse>;
    };
  };
}

export async function checkCommenterRole(
  octokit: CommenterRoleOctokit,
  owner: string,
  repo: string,
  username: string,
): Promise<boolean> {
  const { data } = await octokit.rest.repos.getCollaboratorPermissionLevel({
    owner,
    repo,
    username,
  });

  return data.permission === "admin" || data.permission === "write";
}