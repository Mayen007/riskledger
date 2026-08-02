import { handlePullRequest } from "./runAuditWorkflow";
import { checkCommenterRole, type CommenterRoleOctokit } from "./checkCommenterRole";
import {
  postCommandRejectionComment,
  type CommandRejectionCommentWriter,
  type CommandRepositoryRef,
} from "../actions/postCommandRejectionComment";

export interface IssueCommentCreatedContext {
  payload: {
    action: "created";
    comment: {
      body: string;
      user: {
        login: string;
        type: string;
      };
    };
    issue: {
      number: number;
      pull_request?: {
        url: string;
      };
    };
    repository: {
      full_name: string;
      name: string;
      owner: {
        login: string;
      };
      clone_url: string;
    };
  };
  octokit: CommenterRoleOctokit & {
    rest: {
      issues: CommandRejectionCommentWriter;
    };
    auth: (options: { type: string }) => Promise<{ token: string }>;
  };
  log: {
    info: (data: Record<string, string>, message: string) => void;
    warn: (data: Record<string, string>, message: string) => void;
  };
}

function getIssueCommentCommand(body: string): "/recheck" | "/accept" | null {
  const trimmedBody = body.trim();

  if (trimmedBody.startsWith("/recheck")) {
    return "/recheck";
  }

  if (trimmedBody.startsWith("/accept")) {
    return "/accept";
  }

  return null;
}

function buildPullRequestWorkflowContext(context: IssueCommentCreatedContext): Parameters<typeof handlePullRequest>[0] {
  return {
    payload: {
      repository: {
        owner: { login: context.payload.repository.owner.login },
        name: context.payload.repository.name,
        full_name: context.payload.repository.full_name,
        clone_url: context.payload.repository.clone_url,
      },
      ref: "refs/heads/main",
      pull_request: {
        number: context.payload.issue.number,
        head: { ref: "main" },
      },
    },
    octokit: context.octokit as never,
    log: context.log,
  };
}

function repositoryRef(context: IssueCommentCreatedContext): CommandRepositoryRef {
  return {
    owner: context.payload.repository.owner.login,
    repo: context.payload.repository.name,
  };
}

export async function handleIssueComment(context: IssueCommentCreatedContext): Promise<void> {
  const comment = context.payload.comment;

  if (comment.user.type === "Bot") {
    return;
  }

  const command = getIssueCommentCommand(comment.body);

  if (!command) {
    return;
  }

  const repository = repositoryRef(context);
  const hasPermission = await checkCommenterRole(
    context.octokit,
    repository.owner,
    repository.repo,
    comment.user.login,
  );

  if (!hasPermission) {
    await postCommandRejectionComment(
      context.octokit.rest.issues,
      repository,
      context.payload.issue.number,
      comment.user.login,
    );
    return;
  }

  if (command === "/recheck") {
    if (!context.payload.issue.pull_request) {
      context.log.warn({ repository: context.payload.repository.full_name }, "Ignoring /recheck on a non-pull-request issue");
      return;
    }

    await handlePullRequest(buildPullRequestWorkflowContext(context));
    return;
  }

  context.log.info({ repository: context.payload.repository.full_name }, "Accepted /accept command after permission check");
}