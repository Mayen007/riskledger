import type { ClassifiedFinding } from "../shared/types";
import type { RepositoryRef } from "./openPatchPR";

export interface IssueCommentWriter {
  createComment: (input: {
    owner: string;
    repo: string;
    issue_number: number;
    body: string;
  }) => Promise<unknown>;
  listComments?: (input: {
    owner: string;
    repo: string;
    issue_number: number;
    per_page?: number;
  }) => Promise<{ data: Array<{ id: number; body?: string; user?: { type?: string } }> }>;
  updateComment?: (input: {
    owner: string;
    repo: string;
    comment_id: number;
    body: string;
  }) => Promise<unknown>;
}

function commentMarker(finding: ClassifiedFinding): string {
  return `<!-- riskledger:finding:${finding.finding.ecosystem}:${finding.finding.advisoryId} -->`;
}

function commentBody(finding: ClassifiedFinding): string {
  return [
    commentMarker(finding),
    `RiskLedger could not auto-fix ${finding.finding.packageName}.`,
    `Decision: ${finding.decision}`,
    `Reason: ${finding.reason}`,
  ].join("\n");
}

export async function postRiskComment(
  client: IssueCommentWriter,
  repository: RepositoryRef,
  issueNumber: number,
  finding: ClassifiedFinding,
): Promise<unknown> {
  const body = commentBody(finding);
  if (client.listComments && client.updateComment) {
    const comments = await client.listComments({
      owner: repository.owner,
      repo: repository.repo,
      issue_number: issueNumber,
      per_page: 100,
    });
    const existing = comments.data.find((comment) => comment.body?.includes(commentMarker(finding)));
    if (existing) {
      return client.updateComment({
        owner: repository.owner,
        repo: repository.repo,
        comment_id: existing.id,
        body,
      });
    }
  }

  return client.createComment({
    owner: repository.owner,
    repo: repository.repo,
    issue_number: issueNumber,
    body,
  });
}