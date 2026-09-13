import spawn from "cross-spawn";
import simpleGit from "simple-git";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { readFile, writeFile } from "node:fs/promises";

import type { ClassifiedFinding } from "../shared/types";

export const PATCH_BRANCH = "riskledger/patches";

export interface PatchManifestDirectories {
  npm: string[];
  pip: string[];
}

export class PatchBranchError extends Error {
  constructor(message: string, cause?: unknown) {
    const causeMessage = cause instanceof Error ? `: ${cause.message}` : cause ? `: ${String(cause)}` : "";
    super(`${message}${causeMessage}`);
    this.name = "PatchBranchError";
  }
}

interface PatchCommand {
  command: string;
  args: string[];
}

function runCommand(cwd: string, { command, args }: PatchCommand): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "ignore" });
    child.on("error", reject);
    child.on("close", () => resolve());
  });
}

function getNpmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function authenticatedUrl(cloneUrl: string, token: string): string {
  return cloneUrl.replace(/^https:\/\//, `https://x-access-token:${token}@`);
}

function scrubToken(message: string, token: string): string {
  return message.replaceAll(token, "***");
}

async function updateRequirementsFile(path: string, patchable: ClassifiedFinding[]): Promise<void> {
  let content = await readFile(path, "utf8");

  for (const classified of patchable) {
    if (classified.finding.ecosystem !== "pip") {
      continue;
    }

    const version = classified.finding.patchedVersions?.[0];
    if (!version) {
      throw new PatchBranchError(`No concrete fixed version is available for ${classified.finding.packageName}`);
    }

    const packagePattern = classified.finding.packageName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const linePattern = new RegExp(`^([ \\t]*${packagePattern})(?:[<>=!~].*)?$`, "gim");
    const updated = content.replace(linePattern, `${classified.finding.packageName}==${version}`);
    if (updated === content) {
      throw new PatchBranchError(`Could not update ${classified.finding.packageName} in ${path}`);
    }
    content = updated;
  }

  await writeFile(path, content, "utf8");
}

/**
 * Applies ecosystem-native fixes in a temporary checkout, verifies that the
 * requested advisories are gone, and pushes the resulting branch.
 */
export async function createPatchBranch(
  cwd: string,
  cloneUrl: string,
  token: string,
  manifests: PatchManifestDirectories,
  patchable: ClassifiedFinding[],
): Promise<boolean> {
  const git = simpleGit({ baseDir: cwd, unsafe: { allowUnsafeConfigPaths: true } }).env({
    GIT_TERMINAL_PROMPT: "0",
    GCM_INTERACTIVE: "never",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "",
  });

  try {
    const remoteBranch = await git.listRemote(["--heads", "origin", PATCH_BRANCH]);
    if (remoteBranch.trim().length > 0) {
      await git.fetch("origin", PATCH_BRANCH);
      await git.checkoutBranch(PATCH_BRANCH, `origin/${PATCH_BRANCH}`);
    } else {
      await git.checkoutLocalBranch(PATCH_BRANCH);
    }

    for (const directory of manifests.npm) {
      await runCommand(directory, { command: getNpmCommand(), args: ["audit", "fix"] });
    }

    for (const directory of manifests.pip) {
      const requirementsPath = join(directory, "requirements.txt");
      if (!existsSync(requirementsPath)) {
        throw new PatchBranchError(`Cannot create a reproducible pip patch for ${directory}: requirements.txt is required`);
      }

      await runCommand(directory, {
        command: "pip-audit",
        args: ["--fix", "--requirement", requirementsPath],
      });
      await updateRequirementsFile(requirementsPath, patchable);
    }

    const dependencyPaths = manifests.npm.flatMap((directory) => [
      join(directory, "package.json"),
      join(directory, "package-lock.json"),
      join(directory, "npm-shrinkwrap.json"),
    ]).filter((path) => existsSync(path));
    dependencyPaths.push(...manifests.pip.map((directory) => join(directory, "requirements.txt")));

    await git.add(dependencyPaths);
    const status = await git.status();
    if (status.staged.length === 0) {
      return false;
    }

    await git.addConfig("user.name", "riskledger[bot]");
    await git.addConfig("user.email", "riskledger[bot]@users.noreply.github.com");
    await git.commit("chore(riskledger): patch dependency vulnerabilities");
    await git.raw(["-c", "credential.helper=", "push", authenticatedUrl(cloneUrl, token), PATCH_BRANCH]);
    return true;
  } catch (error) {
    if (error instanceof PatchBranchError) {
      throw new PatchBranchError(scrubToken(error.message, token));
    }
    throw new PatchBranchError("Failed to create dependency patch branch", scrubToken(String(error), token));
  }
}