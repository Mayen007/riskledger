import type { AuditFinding, ClassifiedFinding } from "../shared/types";
import { classify } from "../classify/classify";
import { loadPolicy } from "../classify/loadPolicy";
import { dedup } from "../classify/dedup";
import { appendToRiskLog } from "../actions/appendToRiskLog";
import { openPatchPR, type PullRequestWriter, type RepositoryRef } from "../actions/openPatchPR";
import { postRiskComment, type IssueCommentWriter } from "../actions/postRiskComment";
import { writeStatusBadge } from "../actions/writeStatusBadge";
import { computeDigestStats } from "../shared/computeDigestStats";
import { runAuditNpm } from "../audit/runAuditNpm";
import { runAuditPip } from "../audit/runAuditPip";
import { withRepoCheckout, CheckoutError } from "../audit/checkoutRepo";
import { findManifestDirectories } from "../audit/detectEcosystems";
import { runInBatches } from "../shared/batch";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import simpleGit from "simple-git";

export { CheckoutError };

/**
 * Narrow interface for listing the files changed in a pull request.
 * Requesting up to 300 files covers the GitHub API maximum.
 */
export interface PullRequestFilesReader {
  listFiles: (input: {
    owner: string;
    repo: string;
    pull_number: number;
    per_page?: number;
  }) => Promise<{ data: Array<{ filename: string }> }>;
}

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
      pulls: PullRequestWriter & PullRequestFilesReader;
      issues: IssueCommentWriter;
    };
    auth: (options: { type: string }) => Promise<{ token: string }>;
  };
  log: {
    info: (data: Record<string, string>, message: string) => void;
    warn: (data: Record<string, string>, message: string) => void;
  };
}


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

/**
 * Writes the shields.io badge JSON and commits + pushes it back to the repo.
 * The commit message prefix `chore(riskledger):` is detected by the push
 * handler in app.ts to skip re-auditing on this bot-authored commit.
 */
async function commitBadge(
  cwd: string,
  classified: ClassifiedFinding[],
  token: string,
  cloneUrl: string,
): Promise<void> {
  const stats = computeDigestStats(classified);
  const hasHighOrCritical = classified.some(
    (cf) => cf.finding.severity === "high" || cf.finding.severity === "critical",
  );
  await writeStatusBadge(cwd, stats, hasHighOrCritical);

  const authenticatedUrl = cloneUrl.replace(/^https:\/\//, `https://x-access-token:${token}@`);
  const git = simpleGit({
    baseDir: cwd,
    unsafe: { allowUnsafeConfigPaths: true },
  }).env({
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "never",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "",
  });
  await git.addConfig("user.name", "riskledger[bot]");
  await git.addConfig("user.email", "riskledger[bot]@users.noreply.github.com");

  if (process.env.GIT_SIGN_COMMITS === "true" || process.env.GPG_KEY_ID) {
    await git.addConfig("commit.gpgsign", "true");
    if (process.env.GPG_KEY_ID) {
      await git.addConfig("user.signingkey", process.env.GPG_KEY_ID);
    }
  }

  await git.add(".riskledger/");

  const status = await git.status();
  if (status.staged.length === 0) {
    // Badge unchanged — nothing to commit.
    return;
  }

  await git.commit("chore(riskledger): update security badge");
  await git.push(authenticatedUrl, "HEAD");
}

const AUDIT_BATCH_CONCURRENCY = 3;

async function classifyRepository(
  cwd: string,
  log: WorkflowContext["log"],
  repository: string,
): Promise<ClassifiedFinding[]> {
  const manifests = await findManifestDirectories(cwd);

  if (manifests.npm.length === 0 && manifests.pip.length === 0) {
    log.warn({ repository }, "No known package manifests found in repository — skipping audit");
    return [];
  }

  const policy = await loadPolicy(cwd);
  const allFindings: AuditFinding[] = [];

  const npmResults = await runInBatches(manifests.npm, AUDIT_BATCH_CONCURRENCY, async (npmDir) => {
    try {
      return await runAuditNpm(npmDir);
    } catch (error) {
      log.warn({ repository, dir: npmDir, error: String(error) }, "Failed to run npm audit in directory");
      return [];
    }
  });
  for (const res of npmResults) {
    allFindings.push(...res);
  }

  const pipResults = await runInBatches(manifests.pip, AUDIT_BATCH_CONCURRENCY, async (pipDir) => {
    try {
      return await runAuditPip(pipDir);
    } catch (error) {
      log.warn({ repository, dir: pipDir, error: String(error) }, "Failed to run pip audit in directory");
      return [];
    }
  });
  for (const res of pipResults) {
    allFindings.push(...res);
  }

  return classify(dedup(allFindings), policy);
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
  const cloneUrl = context.payload.repository.clone_url;

  const patchableFindings = await withRepoCheckout(
    { cloneUrl, token, ref },
    async (cwd) => {
      const classified = await classifyRepository(cwd, context.log, repoLabel);
      await commitBadge(cwd, classified, token, cloneUrl);
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
  const pr = context.payload.pull_request;

  // Non-negotiable #6: a PR touching .security-policy.json must always go to
  // human review, regardless of what the new policy says. Check this BEFORE
  // checking out the repo or running any audit logic.
  const { data: changedFiles } = await context.octokit.rest.pulls.listFiles({
    owner: repository.owner,
    repo: repository.repo,
    pull_number: pr.number,
    per_page: 300,
  });

  if (changedFiles.some((f) => f.filename === ".security-policy.json")) {
    context.log.warn(
      { repository: repoLabel, pullRequestNumber: String(pr.number) },
      "PR touches .security-policy.json — routing to mandatory human review",
    );
    await context.octokit.rest.issues.createComment({
      owner: repository.owner,
      repo: repository.repo,
      issue_number: pr.number,
      body: [
        "⚠️ **Policy change detected**",
        "",
        "This PR modifies `.security-policy.json`, which controls how RiskLedger classifies and auto-patches findings.",
        "It requires human review and **will not be auto-merged** by RiskLedger, regardless of the `autoMergePatchLevel` setting.",
      ].join("\n"),
    });
    return;
  }
  // Prefer the commit SHA for an exact checkout; fall back to the branch ref
  const token = await getInstallationToken(context);
  const ref = pr.head.sha ?? pr.head.ref;

  const cloneUrl = context.payload.repository.clone_url;

  const reviewFindings = await withRepoCheckout(
    { cloneUrl, token, ref },
    async (cwd) => {
      const classified = await classifyRepository(cwd, context.log, repoLabel);
      const review = selectReviewFindings(classified);
      await persistRiskLog(cwd, review);
      await commitBadge(cwd, classified, token, cloneUrl);
      return review;
    },
  );

  for (const finding of reviewFindings) {
    await postRiskComment(context.octokit.rest.issues, repository, pr.number, finding);
  }
}