import type { AuditFinding, ClassifiedFinding, ClassificationPolicy } from "../shared/types";
import { classify } from "../classify/classify";
import { appendToRiskLog } from "../actions/appendToRiskLog";
import { openPatchPR, type PullRequestWriter, type RepositoryRef } from "../actions/openPatchPR";
import { postRiskComment, type IssueCommentWriter } from "../actions/postRiskComment";
import { runAuditNpm } from "../audit/runAuditNpm";
import { withRepoCheckout, CheckoutError } from "../audit/checkoutRepo";
import { detectEcosystems } from "../audit/detectEcosystems";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";

export { CheckoutError };

export interface WorkflowContext {
  payload: {
    repository: {
      owner: { login: string };
      name: string;
      full_name: string;
      clone_url: string;
    };
    ref: string;
    pull_request?: {
      number: number;
      head: { ref: string; sha?: string };
    };
  };
  octokit: {
    rest: {
      pulls: PullRequestWriter;
      issues: IssueCommentWriter;
    };
    auth: (options: { type: string }) => Promise<{ token: string }>;
  };
  log: {
    info: (data: Record<string, string>, message: string) => void;
    warn: (data: Record<string, string>, message: string) => void;
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

async function persistRiskLog(cwd: string, findings: ClassifiedFinding[]): Promise<void> {
  if (findings.length === 0) {
    return;
  }

  const riskLogPath = resolve(cwd, "accepted-risks.md");
  const existingLog = existsSync(riskLogPath) ? await readFile(riskLogPath, "utf8") : "";
  const updatedLog = findings.reduce((log, finding) => appendToRiskLog(log, finding), existingLog);

  await writeFile(riskLogPath, updatedLog, "utf8");
}

async function classifyRepository(
  cwd: string,
  log: WorkflowContext["log"],
  repository: string,
): Promise<ClassifiedFinding[]> {
  const ecosystems = await detectEcosystems(cwd);

  if (ecosystems.length === 0) {
    log.warn({ repository }, "No known package manifests found in repository — skipping audit");
    return [];
  }

  const allFindings: AuditFinding[] = [];

  if (ecosystems.includes("npm")) {
    const findings = await runAuditNpm(cwd);
    allFindings.push(...findings);
  }

  // pip support is detected but not yet implemented; log a note if present
  if (ecosystems.includes("pip")) {
    log.info({ repository }, "pip ecosystem detected — pip-audit backend not yet implemented, skipping");
  }

  return classify(allFindings, defaultPolicy);
}

async function getInstallationToken(context: WorkflowContext): Promise<string> {
  const authResult = await context.octokit.auth({ type: "installation" });
  return authResult.token;
}

export async function handlePush(context: WorkflowContext): Promise<void> {
  const repository = repositoryRef(context);
  const repoLabel = `${repository.owner}/${repository.repo}`;
  const token = await getInstallationToken(context);
  const ref = context.payload.ref.replace(/^refs\/heads\//, "");

  const patchableFindings = await withRepoCheckout(
    { cloneUrl: context.payload.repository.clone_url, token, ref },
    async (cwd) => {
      const classified = await classifyRepository(cwd, context.log, repoLabel);
      return selectPatchableFindings(classified);
    },
  );

  if (patchableFindings.length === 0) {
    context.log.info({ repository: repoLabel }, "No patchable findings");
    return;
  }

  await openPatchPR(context.octokit.rest.pulls, repository, patchableFindings);
}

export async function handlePullRequest(context: WorkflowContext): Promise<void> {
  if (!context.payload.pull_request) {
    return;
  }

  const repository = repositoryRef(context);
  const repoLabel = `${repository.owner}/${repository.repo}`;
  const token = await getInstallationToken(context);
  const pr = context.payload.pull_request;
  // Prefer the commit SHA for an exact checkout; fall back to the branch ref
  const ref = pr.head.sha ?? pr.head.ref;

  const reviewFindings = await withRepoCheckout(
    { cloneUrl: context.payload.repository.clone_url, token, ref },
    async (cwd) => {
      const classified = await classifyRepository(cwd, context.log, repoLabel);
      const review = selectReviewFindings(classified);
      await persistRiskLog(cwd, review);
      return review;
    },
  );

  for (const finding of reviewFindings) {
    await postRiskComment(context.octokit.rest.issues, repository, pr.number, finding);
  }
}