import type { AcceptedRiskEntry } from "../shared/types";
import { appendAcceptedRisk, type PolicyFileClient } from "../actions/updatePolicyFile";

export interface AcceptContext {
  payload: {
    comment: { body: string };
    issue: { number: number };
    repository: {
      owner: { login: string };
      name: string;
    };
  };
  octokit: {
    rest: {
      issues: {
        createComment: (input: {
          owner: string;
          repo: string;
          issue_number: number;
          body: string;
        }) => Promise<unknown>;
      };
      repos: PolicyFileClient;
    };
  };
}

/**
 * Parses the `/accept` command body.
 *
 * Expected format: `/accept <advisoryId> <reason text...>`
 * Example:         `/accept GHSA-xxxx-yyyy-zzzz Only affects SSR mode which we don't use`
 */
export function parseAcceptCommand(body: string): { advisoryId: string; reason: string } | null {
  const match = /^\/accept\s+(\S+)\s+(.+)$/s.exec(body.trim());
  if (!match?.[1] || !match?.[2]) {
    return null;
  }

  return {
    advisoryId: match[1].trim(),
    reason: match[2].trim(),
  };
}

/**
 * Handles an authorized `/accept` command:
 *  1. Parses the advisory ID and reason from the comment body.
 *  2. Appends the entry to `.security-policy.json` via the GitHub API.
 *  3. Posts a confirmation comment, or a usage hint if the format is wrong.
 */
export async function handleAccept(context: AcceptContext, commenterLogin: string): Promise<void> {
  const parsed = parseAcceptCommand(context.payload.comment.body);

  if (!parsed) {
    await context.octokit.rest.issues.createComment({
      owner: context.payload.repository.owner.login,
      repo: context.payload.repository.name,
      issue_number: context.payload.issue.number,
      body: [
        "⚠️ Invalid `/accept` format.",
        "",
        "Usage: `/accept <advisory-id> <reason>`",
        "",
        "Example:",
        "```",
        "/accept GHSA-xxxx-yyyy-zzzz Only affects SSR mode which this app does not use",
        "```",
      ].join("\n"),
    });
    return;
  }

  const entry: AcceptedRiskEntry = {
    cve: parsed.advisoryId,
    reason: parsed.reason,
    decidedBy: commenterLogin,
  };

  await appendAcceptedRisk(
    context.octokit.rest.repos,
    context.payload.repository.owner.login,
    context.payload.repository.name,
    entry,
    commenterLogin,
  );

  await context.octokit.rest.issues.createComment({
    owner: context.payload.repository.owner.login,
    repo: context.payload.repository.name,
    issue_number: context.payload.issue.number,
    body: [
      `✅ Advisory \`${parsed.advisoryId}\` added to \`.security-policy.json\` as an accepted risk.`,
      "",
      `> ${parsed.reason}`,
      "",
      "Run `/recheck` to verify this finding no longer triggers a comment.",
    ].join("\n"),
  });
}
