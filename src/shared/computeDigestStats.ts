import type { ClassifiedFinding } from "./types";

export interface DigestStats {
  /** Findings that will be (or were) auto-patched via a PR. */
  patchable: number;
  /** Findings routed to human review. */
  needsReview: number;
  /** Findings explicitly accepted via policy or /accept command. */
  acceptedRisk: number;
  /** Total findings across all decisions. */
  total: number;
}

/**
 * Summarises an array of classified findings into digest counts.
 * Pure function — no I/O, safe to call from classify/ or actions/ layers.
 */
export function computeDigestStats(findings: ClassifiedFinding[]): DigestStats {
  let patchable = 0;
  let needsReview = 0;
  let acceptedRisk = 0;

  for (const { decision } of findings) {
    if (decision === "patchable") patchable++;
    else if (decision === "needs-review") needsReview++;
    else if (decision === "accepted-risk") acceptedRisk++;
  }

  return { patchable, needsReview, acceptedRisk, total: findings.length };
}
