export interface CommandRejectionCommentWriter {
  createComment: (input: {
    owner: string;
    repo: string;
    issue_number: number;
    body: string;
  }) => Promise<unknown>;
}

export interface CommandRepositoryRef {
  owner: string;
  repo: string;
}

export async function postCommandRejectionComment(
  client: CommandRejectionCommentWriter,
  repository: CommandRepositoryRef,
  issueNumber: number,
  username: string,
): Promise<unknown> {
  return client.createComment({
    owner: repository.owner,
    repo: repository.repo,
    issue_number: issueNumber,
    body: `@${username} needs write or admin access to use /recheck or /accept on this repository.`,
  });
}