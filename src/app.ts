import type { Probot } from "probot";

import { handleIssueComment } from "./commands/handleIssueComment";
import { CheckoutError, handlePullRequest, handlePush } from "./commands/runAuditWorkflow";
import { scheduleWeeklyDigest } from "./commands/scheduleWeeklyDigest";
import { getRateLimitDetails } from "./shared/rateLimit";

/** Narrow interface for the parts of Probot's Express app we actually use. */
interface ProbotWithRoutes {
  expressApp: {
    get(path: string, handler: (req: unknown, res: { json(body: unknown): void }) => void): void;
  };
}

export default function registerApp(app: Probot): void {
  app.on("push", async (context) => {
    const repository = context.payload.repository.full_name;
    const ref = context.payload.ref;

    // Skip push events triggered by RiskLedger's own badge commits to prevent
    // a self-triggering audit loop. The badge commit uses the prefix
    // "chore(riskledger):" so it can be detected here without storing state.
    const headCommitMessage: string =
      (context.payload as { head_commit?: { message?: string } }).head_commit?.message ?? "";
    if (headCommitMessage.startsWith("chore(riskledger):")) {
      app.log.info({ repository }, "Skipping push triggered by RiskLedger bot commit");
      return;
    }

    app.log.info({ repository, ref }, "Received push event");

    try {
      await handlePush(context as never);
    } catch (error) {
      if (error instanceof CheckoutError) {
        app.log.warn({ repository, error: error.message }, "Skipping push workflow because the checkout failed");
        return;
      }

      const rateLimit = getRateLimitDetails(error);
      if (rateLimit.isRateLimit) {
        app.log.warn(
          {
            repository,
            retryAfterSeconds: rateLimit.retryAfterSeconds !== undefined ? String(rateLimit.retryAfterSeconds) : undefined,
            isSecondary: String(rateLimit.isSecondary),
          },
          `GitHub API rate limit encountered (${rateLimit.isSecondary ? "secondary" : "primary"}). Skipping push workflow.`,
        );
        return;
      }

      throw error;
    }
  });

  app.on("pull_request.opened", async (context) => {
    const repository = context.payload.repository.full_name;
    const pullRequestNumber = context.payload.pull_request.number;

    app.log.info({ repository, pullRequestNumber: String(pullRequestNumber) }, "Received pull_request.opened event");

    try {
      await handlePullRequest(context as never);
    } catch (error) {
      if (error instanceof CheckoutError) {
        app.log.warn({ repository, error: error.message }, "Skipping pull_request.opened workflow because the checkout failed");
        return;
      }

      const rateLimit = getRateLimitDetails(error);
      if (rateLimit.isRateLimit) {
        app.log.warn(
          {
            repository,
            retryAfterSeconds: rateLimit.retryAfterSeconds !== undefined ? String(rateLimit.retryAfterSeconds) : undefined,
            isSecondary: String(rateLimit.isSecondary),
          },
          `GitHub API rate limit encountered (${rateLimit.isSecondary ? "secondary" : "primary"}). Skipping pull_request.opened workflow.`,
        );
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
      await handleIssueComment(context as never);
    } catch (error) {
      if (error instanceof CheckoutError) {
        app.log.warn({ repository, error: error.message }, "Skipping issue_comment workflow because the checkout failed");
        return;
      }

      const rateLimit = getRateLimitDetails(error);
      if (rateLimit.isRateLimit) {
        app.log.warn(
          {
            repository,
            retryAfterSeconds: rateLimit.retryAfterSeconds !== undefined ? String(rateLimit.retryAfterSeconds) : undefined,
            isSecondary: String(rateLimit.isSecondary),
          },
          `GitHub API rate limit encountered (${rateLimit.isSecondary ? "secondary" : "primary"}). Skipping issue_comment workflow.`,
        );
        return;
      }

      throw error;
    }
  });

  // Health / status endpoint — lets Render's HTTP health check and humans
  // visiting the root URL get a 200 rather than a 404.
  // expressApp is not in Probot's public TS types, so we use a narrow interface
  // rather than casting to any (per AGENTS.md conventions).
  (app as unknown as ProbotWithRoutes).expressApp.get("/", (_req, res) => {
    res.json({ status: "ok", app: "RiskLedger", version: "0.1.0" });
  });

  // Schedule the weekly security digest. Runs once at server start-up using
  // this Probot instance. Schedule is configurable via DIGEST_CRON env var.
  scheduleWeeklyDigest(app);
}