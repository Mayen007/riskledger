import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { DigestStats } from "../shared/computeDigestStats";

/** Shields.io endpoint badge schema v1. */
export interface ShieldsBadge {
  schemaVersion: 1;
  label: string;
  message: string;
  color: string;
}

/**
 * Returns the shields.io badge color based on the digest stats.
 * Any critical/high finding is always red; otherwise scales by open count.
 */
export function badgeColor(
  stats: DigestStats,
  hasHighOrCritical: boolean,
): string {
  if (hasHighOrCritical) return "red";
  const open = stats.needsReview + stats.patchable;
  if (open === 0) return "brightgreen";
  if (open <= 2) return "yellow";
  return "orange";
}

/**
 * Returns the human-readable badge message for the given stats.
 */
export function badgeMessage(stats: DigestStats): string {
  const open = stats.needsReview + stats.patchable;
  if (open === 0) return "secure";
  return `${open} open`;
}

/**
 * Builds the shields.io endpoint JSON for the given stats.
 */
export function buildBadge(
  stats: DigestStats,
  hasHighOrCritical: boolean,
): ShieldsBadge {
  return {
    schemaVersion: 1,
    label: "security",
    message: badgeMessage(stats),
    color: badgeColor(stats, hasHighOrCritical),
  };
}

/**
 * Writes `.riskledger/badge.json` (shields.io endpoint format) into `cwd`.
 * The file is intended to be committed to the target repo so a shields.io
 * endpoint badge can reference it directly via the raw GitHub URL.
 */
export async function writeStatusBadge(
  cwd: string,
  stats: DigestStats,
  hasHighOrCritical: boolean,
): Promise<void> {
  const dir = join(cwd, ".riskledger");
  await mkdir(dir, { recursive: true });
  const badge = buildBadge(stats, hasHighOrCritical);
  await writeFile(join(dir, "badge.json"), JSON.stringify(badge, null, 2) + "\n", "utf8");
}
