import type { Probot } from "probot";

import { handleIssueComment } from "./commands/handleIssueComment";
import { RepoPathValidationError, handlePullRequest, handlePush } from "./commands/runAuditWorkflow";

export default function registerApp(app: Probot): void {
  app.on("push", async (context) => {
    const repository = context.payload.repository.full_name;
    const ref = context.payload.ref;

    app.log.info({ repository, ref }, "Received push event");

    try {
      await handlePush(context as never, process.env.RISKLEDGER_REPO_PATH ?? process.cwd());
    } catch (error) {
      if (error instanceof RepoPathValidationError) {
        app.log.warn({ repository, error: error.message }, "Skipping push workflow because the repo path is invalid");
        return;
      }

      throw error;
    }
  });

  app.on("pull_request", async (context) => {
    const repository = context.payload.repository.full_name;
    const pullRequestNumber = context.payload.pull_request.number;

    app.log.info({ repository, pullRequestNumber: String(pullRequestNumber) }, "Received pull_request event");

    try {
      await handlePullRequest(context as never, process.env.RISKLEDGER_REPO_PATH ?? process.cwd());
    } catch (error) {
      if (error instanceof RepoPathValidationError) {
        app.log.warn({ repository, error: error.message }, "Skipping pull_request workflow because the repo path is invalid");
        return;
      }

      throw error;
    }
  });

  app.on("issue_comment.created", async (context) => {
    const repository = context.payload.repository.full_name;

    app.log.info(
      { repository, issueNumber: String(context.payload.issue.number) },
      "Received issue_comment.created event",
    );

    try {
      await handleIssueComment(context as never, process.env.RISKLEDGER_REPO_PATH ?? process.cwd());
    } catch (error) {
      if (error instanceof RepoPathValidationError) {
        app.log.warn({ repository, error: error.message }, "Skipping issue_comment workflow because the repo path is invalid");
        return;
      }

      throw error;
    }
  });
}