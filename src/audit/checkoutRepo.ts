import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import simpleGit from "simple-git";

export class CheckoutError extends Error {
  constructor(repoUrl: string, cause: unknown) {
    const message =
      cause instanceof Error ? cause.message : String(cause);
    // Scrub any embedded token from the URL before surfacing it
    const safeUrl = repoUrl.replace(/x-access-token:[^@]+@/, "x-access-token:***@");
    super(`Failed to clone ${safeUrl}: ${message}`);
    this.name = "CheckoutError";
  }
}

export interface CheckoutOptions {
  cloneUrl: string;
  token: string;
  ref: string;
}

/**
 * Shallow-clones `cloneUrl` at `ref` into a fresh temp directory, runs
 * `callback` with that directory as `cwd`, then removes the temp directory
 * unconditionally (even if `callback` throws).
 *
 * The installation token is embedded in the clone URL as
 * `x-access-token:<token>@` and is never surfaced in error messages.
 */
export async function withRepoCheckout<T>(
  options: CheckoutOptions,
  callback: (cwd: string) => Promise<T>,
): Promise<T> {
  const { cloneUrl, token, ref } = options;

  // Embed the installation token into the HTTPS URL for git auth.
  // Shape: https://x-access-token:<token>@github.com/owner/repo.git
  const authenticatedUrl = cloneUrl.replace(
    /^https:\/\//,
    `https://x-access-token:${token}@`,
  );

  const tempDir = await mkdtemp(join(tmpdir(), "riskledger-"));

  try {
    try {
      // GIT_TERMINAL_PROMPT=0 — git fails immediately instead of blocking on
      // any interactive prompt (works across all credential helpers).
      // GCM_INTERACTIVE=never — explicitly tells GCM not to open a GUI prompt.
      //
      // GIT_CONFIG_NOSYSTEM=1 + GIT_CONFIG_GLOBAL="" — prevents Git from
      // loading system and global config files. This is the key fix: on
      // Windows, GCM's credential helper is registered in system/global
      // config. By not loading those configs, no credential helper is
      // registered, so Git uses the token already embedded in the URL
      // directly — no credential.helper override needed, no
      // allowUnsafeCredentialHelper guard triggered, no EDITOR guard
      // triggered. This avoids the whack-a-mole of fighting each new
      // security guard that Git 2.39+ / 2.50+ adds.
      await simpleGit({ unsafe: { allowUnsafeConfigPaths: true } })
        .env({
          GIT_TERMINAL_PROMPT: "0",
          GCM_INTERACTIVE: "never",
          GIT_CONFIG_NOSYSTEM: "1",
          GIT_CONFIG_GLOBAL: "",
        })
        .clone(authenticatedUrl, tempDir, [
          "--depth",
          "1",
          "--branch",
          ref,
        ]);
    } catch (err) {
      throw new CheckoutError(cloneUrl, err);
    }

    return await callback(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
