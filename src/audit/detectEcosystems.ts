import { access } from "node:fs/promises";
import { join } from "node:path";

export type Ecosystem = "npm" | "pip";

/**
 * Inspects the root of a checked-out repository and returns the set of
 * ecosystems whose manifest files are present.
 *
 * - "npm"  → package.json is present
 * - "pip"  → requirements.txt or pyproject.toml is present
 *
 * Returns an empty array if no known manifests are found.
 */
export async function detectEcosystems(cwd: string): Promise<Ecosystem[]> {
  const ecosystems: Ecosystem[] = [];

  if (await fileExists(join(cwd, "package.json"))) {
    ecosystems.push("npm");
  }

  const hasPip =
    (await fileExists(join(cwd, "requirements.txt"))) ||
    (await fileExists(join(cwd, "pyproject.toml")));

  if (hasPip) {
    ecosystems.push("pip");
  }

  return ecosystems;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
