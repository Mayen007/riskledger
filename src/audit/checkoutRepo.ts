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
      // GCM_INTERACTIVE=never — explicitly disables the Windows Git Credential
      // Manager GUI ("Select an account" dialog) on Windows servers.
      //
      // Git 2.39+ / GCM v2.x rejects `-c credential.helper=` even when
      // `credential.allowUnsafeCredentialHelper=true` is also in the same -c
      // chain, because the guard runs before -c processing completes. Using
      // GIT_CONFIG_COUNT/KEY/VALUE env vars injects config at "system" level
      // before the guard check fires, reliably clearing the helper without
      // triggering the "not permitted without enabling allowUnsafeCredentialHelper"
      // error on Windows dev machines and CI alike.
      await simpleGit()
        .env({
          ...process.env,
          GIT_TERMINAL_PROMPT: "0",
          GCM_INTERACTIVE: "never",
          GIT_CONFIG_COUNT: "2",
          GIT_CONFIG_KEY_0: "credential.allowUnsafeCredentialHelper",
          GIT_CONFIG_VALUE_0: "true",
          GIT_CONFIG_KEY_1: "credential.helper",
          GIT_CONFIG_VALUE_1: "",
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
