import { readdir } from "node:fs/promises";
import { join } from "node:path";

export type Ecosystem = "npm" | "pip";

export interface ManifestDirectories {
  npm: string[];
  pip: string[];
}

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".venv",
  "venv",
  "env",
  ".env",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "coverage",
  ".tox",
  "__pycache__",
  ".riskledger",
  ".github",
  ".vscode",
  ".idea",
]);

const MAX_DEPTH = 4;

/**
 * Recursively scans a repository root up to MAX_DEPTH to find directories containing
 * package manifests for supported ecosystems (npm, pip).
 *
 * Excludes build, dependency, and tooling directories (e.g. node_modules, .git, .venv).
 */
export async function findManifestDirectories(
  cwd: string,
  maxDepth = MAX_DEPTH,
): Promise<ManifestDirectories> {
  const npmDirs = new Set<string>();
  const pipDirs = new Set<string>();

  async function scan(currentDir: string, depth: number): Promise<void> {
    if (depth > maxDepth) {
      return;
    }

    let entries;
    try {
      entries = await readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    const subdirs: string[] = [];
    let hasNpm = false;
    let hasPip = false;

    for (const entry of entries) {
      if (entry.isFile()) {
        if (entry.name === "package.json") {
          hasNpm = true;
        } else if (entry.name === "requirements.txt" || entry.name === "pyproject.toml") {
          hasPip = true;
        }
      } else if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
          subdirs.push(join(currentDir, entry.name));
        }
      }
    }

    if (hasNpm) {
      npmDirs.add(currentDir);
    }
    if (hasPip) {
      pipDirs.add(currentDir);
    }

    for (const subdir of subdirs) {
      await scan(subdir, depth + 1);
    }
  }

  await scan(cwd, 0);

  return {
    npm: Array.from(npmDirs),
    pip: Array.from(pipDirs),
  };
}

/**
 * Inspects a checked-out repository (root and subdirectories) and returns the set of
 * ecosystems whose manifest files are present.
 *
 * - "npm"  → package.json is present in root or subdirectories
 * - "pip"  → requirements.txt or pyproject.toml is present in root or subdirectories
 *
 * Returns an empty array if no known manifests are found.
 */
export async function detectEcosystems(cwd: string): Promise<Ecosystem[]> {
  const { npm, pip } = await findManifestDirectories(cwd);
  const ecosystems: Ecosystem[] = [];

  if (npm.length > 0) {
    ecosystems.push("npm");
  }

  if (pip.length > 0) {
    ecosystems.push("pip");
  }

  return ecosystems;
}

