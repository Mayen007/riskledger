import type { Probot } from "probot";

import { handlePullRequest, handlePush } from "./commands/runAuditWorkflow";

function isRepoPathValidationError(error: unknown): error is Error {
  return error instanceof Error && error.message.startsWith("RiskLedger repo path does not exist:");
}

export default function registerApp(app: Probot): void {
  app.on("push", async (context) => {
    const repository = context.payload.repository.full_name;
    const ref = context.payload.ref;

    app.log.info({ repository, ref }, "Received push event");

    try {
      await handlePush(context as never, process.env.RISKLEDGER_REPO_PATH ?? process.cwd());
    } catch (error) {
      if (isRepoPathValidationError(error)) {
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
      if (isRepoPathValidationError(error)) {
        app.log.warn({ repository, error: error.message }, "Skipping pull_request workflow because the repo path is invalid");
        return;
      }

      throw error;
    }
  });
}