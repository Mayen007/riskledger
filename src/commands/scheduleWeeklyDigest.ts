import { schedule } from "node-cron";
import type { Probot } from "probot";
import { postWeeklyDigest } from "../actions/postWeeklyDigest";
import type { DigestStats } from "../shared/computeDigestStats";

/**
 * Narrow interface covering only the GitHub API calls made by the digest cron.
 * Defined locally per AGENTS.md to avoid `any` without importing the full
 * Octokit type tree.
 */
interface DigestOctokit {
  paginate<T>(fn: unknown, params?: Record<string, unknown>): Promise<T[]>;
  rest: {
    apps: {
      listInstallations: unknown;
      listReposAccessibleToInstallation: unknown;
    };
    repos: {
      getContent(params: {
        owner: string;
        repo: string;
        path: string;
      }): Promise<{ data: { type?: string; content?: string; encoding?: string } | unknown[] }>;
    };
    issues: {
      create(params: {
        owner: string;
        repo: string;
        title: string;
        body: string;
        labels?: string[];
      }): Promise<unknown>;
    };
  };
}

interface InstallationRecord {
  id: number;
}

interface RepoRecord {
  owner: { login: string };
  name: string;
}

interface StoredStats extends DigestStats {
  updatedAt: string;
}

/**
 * Reads `.riskledger/stats.json` from a repo via the GitHub API.
 * Returns `null` if the file doesn't exist (repo not yet audited by RiskLedger).
 */
async function readRepoStats(
  octokit: DigestOctokit,
  owner: string,
  repo: string,
): Promise<StoredStats | null> {
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: ".riskledger/stats.json",
    });

    if (Array.isArray(data) || !("content" in data) || !data.content) {
      return null;
    }

    const raw = Buffer.from(data.content, "base64").toString("utf8");
    return JSON.parse(raw) as StoredStats;
  } catch {
    // File doesn't exist or other API error — repo not yet audited.
    return null;
  }
}

/**
 * Runs the weekly digest for every installation and repository that has a
 * `.riskledger/stats.json` (i.e., has been audited at least once).
 */
export async function runDigestForAllInstallations(app: Probot): Promise<void> {
  const appOctokit = (await app.auth()) as unknown as DigestOctokit;
  const installations = await appOctokit.paginate<InstallationRecord>(
    appOctokit.rest.apps.listInstallations,
  );

  for (const installation of installations) {
    const installOctokit = (await app.auth(installation.id)) as unknown as DigestOctokit;
    const repos = await installOctokit.paginate<RepoRecord>(
      installOctokit.rest.apps.listReposAccessibleToInstallation,
      { per_page: 100 },
    );

    for (const repo of repos) {
      const stats = await readRepoStats(installOctokit, repo.owner.login, repo.name);
      if (!stats) continue; // Skip repos not yet audited by RiskLedger.

      try {
        await postWeeklyDigest(
          installOctokit.rest.issues,
          { owner: repo.owner.login, repo: repo.name },
          stats,
        );
      } catch (err) {
        // Log per-repo failures but continue iterating other repos.
        app.log.error(
          { repository: `${repo.owner.login}/${repo.name}`, err: String(err) },
          "Failed to post weekly digest for repository",
        );
      }
    }
  }
}

/**
 * Schedules the weekly security digest using node-cron.
 *
 * The schedule is controlled by the `DIGEST_CRON` environment variable
 * (default: `"0 9 * * 1"` — every Monday at 09:00 UTC).
 * Set `DIGEST_CRON=""` to disable scheduling entirely.
 */
export function scheduleWeeklyDigest(app: Probot): void {
  const cronExpr = process.env["DIGEST_CRON"] ?? "0 9 * * 1";
  if (!cronExpr) {
    app.log.info({}, "Weekly digest scheduling disabled (DIGEST_CRON is empty)");
    return;
  }

  schedule(
    cronExpr,
    () => {
      runDigestForAllInstallations(app).catch((err: unknown) => {
        app.log.error(
          { err: String(err) },
          "Weekly digest cron job failed",
        );
      });
    },
    { timezone: "UTC" },
  );

  app.log.info({ cronExpr }, "Weekly digest scheduled");
}
