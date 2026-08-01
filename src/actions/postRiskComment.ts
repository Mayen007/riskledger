import type { ClassifiedFinding } from "../shared/types";
import type { RepositoryRef } from "./openPatchPR";

export interface IssueCommentWriter {
  createComment: (input: {
    owner: string;
    repo: string;
    issue_number: number;
    body: string;
  }) => Promise<unknown>;
}

export async function postRiskComment(
  client: IssueCommentWriter,
  repository: RepositoryRef,
  issueNumber: number,
  finding: ClassifiedFinding,
): Promise<unknown> {
  return client.createComment({
    owner: repository.owner,
    repo: repository.repo,
    issue_number: issueNumber,
    body: [
      `RiskLedger could not auto-fix ${finding.finding.packageName}.`,
      `Decision: ${finding.decision}`,
      `Reason: ${finding.reason}`,
    ].join("\n"),
  });
}