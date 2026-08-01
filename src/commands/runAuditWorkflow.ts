import type { AuditFinding, ClassifiedFinding, ClassificationPolicy } from "../shared/types";
import { classify } from "../classify/classify";
import { openPatchPR, type PullRequestWriter, type RepositoryRef } from "../actions/openPatchPR";
import { postRiskComment, type IssueCommentWriter } from "../actions/postRiskComment";
import { runAuditNpm } from "../audit/runAuditNpm";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export interface WorkflowContext {
  payload: {
    repository: {
      owner: { login: string };
      name: string;
      full_name: string;
    };
    ref: string;
    pull_request?: {
      number: number;
      head: { ref: string };
    };
  };
  octokit: {
    rest: {
      pulls: PullRequestWriter;
      issues: IssueCommentWriter;
    };
  };
  log: {
    info: (data: Record<string, string>, message: string) => void;
  };
}

const defaultPolicy: ClassificationPolicy = {
  autoPatch: {
    minSeverity: "low",
    maxSeverity: "moderate",
  },
};

function repositoryRef(context: WorkflowContext): RepositoryRef {
  return {
    owner: context.payload.repository.owner.login,
    repo: context.payload.repository.name,
  };
}

function selectPatchableFindings(findings: ClassifiedFinding[]): ClassifiedFinding[] {
  return findings.filter((finding) => finding.decision === "patchable");
}

function selectReviewFindings(findings: ClassifiedFinding[]): ClassifiedFinding[] {
  return findings.filter((finding) => finding.decision === "needs-review");
}

async function classifyRepository(cwd: string): Promise<ClassifiedFinding[]> {
  const findings: AuditFinding[] = await runAuditNpm(cwd);
  return classify(findings, defaultPolicy);
}

function resolveRepoPath(cwd: string): string {
  const resolved = resolve(cwd);

  if (!existsSync(resolved)) {
    throw new Error(`RiskLedger repo path does not exist: ${resolved}`);
  }

  return resolved;
}

export async function handlePush(context: WorkflowContext, cwd: string): Promise<void> {
  const repository = repositoryRef(context);
  const classified = await classifyRepository(resolveRepoPath(cwd));
  const patchableFindings = selectPatchableFindings(classified);

  if (patchableFindings.length === 0) {
    context.log.info({ repository: `${repository.owner}/${repository.repo}` }, "No patchable findings");
    return;
  }

  await openPatchPR(context.octokit.rest.pulls, repository, patchableFindings);
}

export async function handlePullRequest(context: WorkflowContext, cwd: string): Promise<void> {
  if (!context.payload.pull_request) {
    return;
  }

  const repository = repositoryRef(context);
  const classified = await classifyRepository(resolveRepoPath(cwd));
  const reviewFindings = selectReviewFindings(classified);

  for (const finding of reviewFindings) {
    await postRiskComment(context.octokit.rest.issues, repository, context.payload.pull_request.number, finding);
  }
}