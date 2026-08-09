import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { ClassificationPolicy, AuditSeverity, AcceptedRiskEntry } from "../shared/types";

const POLICY_FILENAME = ".security-policy.json";

const ALLOWED_SEVERITIES: AuditSeverity[] = ["low", "moderate", "high", "critical"];

export const DEFAULT_POLICY: ClassificationPolicy = {
  autoPatch: {
    minSeverity: "low",
    maxSeverity: "moderate",
  },
  autoMergePatchLevel: false,
  acceptedRisks: [],
};

function isSeverity(value: unknown): value is AuditSeverity {
  return typeof value === "string" && ALLOWED_SEVERITIES.includes(value as AuditSeverity);
}

function assertField(condition: boolean, fieldPath: string, expected: string): void {
  if (!condition) {
    throw new Error(
      `${POLICY_FILENAME}: invalid value at "${fieldPath}" — expected ${expected}`,
    );
  }
}

function parseAcceptedRisks(raw: unknown, path: string): AcceptedRiskEntry[] {
  if (raw === undefined || raw === null) {
    return [];
  }

  assertField(Array.isArray(raw), path, "an array");

  return (raw as unknown[]).map((entry, i) => {
    assertField(
      typeof entry === "object" && entry !== null,
      `${path}[${i}]`,
      "an object",
    );

    const e = entry as Record<string, unknown>;

    assertField(typeof e["cve"] === "string" && e["cve"].length > 0, `${path}[${i}].cve`, "a non-empty string");
    assertField(typeof e["reason"] === "string" && e["reason"].length > 0, `${path}[${i}].reason`, "a non-empty string");
    assertField(typeof e["decidedBy"] === "string" && e["decidedBy"].length > 0, `${path}[${i}].decidedBy`, "a non-empty string");

    return {
      cve: e["cve"] as string,
      reason: e["reason"] as string,
      decidedBy: e["decidedBy"] as string,
    };
  });
}

function parsePolicy(raw: unknown): ClassificationPolicy {
  assertField(typeof raw === "object" && raw !== null, "root", "an object");

  const obj = raw as Record<string, unknown>;
  const autoPatch = obj["autoPatch"];

  assertField(typeof autoPatch === "object" && autoPatch !== null, "autoPatch", "an object");

  const ap = autoPatch as Record<string, unknown>;
  assertField(isSeverity(ap["minSeverity"]), "autoPatch.minSeverity", `one of ${ALLOWED_SEVERITIES.join(", ")}`);
  assertField(isSeverity(ap["maxSeverity"]), "autoPatch.maxSeverity", `one of ${ALLOWED_SEVERITIES.join(", ")}`);

  const autoMergePatchLevel =
    obj["autoMergePatchLevel"] === undefined ? false : Boolean(obj["autoMergePatchLevel"]);

  const acceptedRisks = parseAcceptedRisks(obj["acceptedRisks"], "acceptedRisks");

  return {
    autoPatch: {
      minSeverity: ap["minSeverity"] as AuditSeverity,
      maxSeverity: ap["maxSeverity"] as AuditSeverity,
    },
    autoMergePatchLevel,
    acceptedRisks,
  };
}

/**
 * Reads `.security-policy.json` from the root of the checked-out repository.
 *
 * - If the file does not exist, returns the DEFAULT_POLICY.
 * - If the file exists but is malformed, throws an error (loud failure > silent misconfiguration).
 */
export async function loadPolicy(repoRoot: string): Promise<ClassificationPolicy> {
  const policyPath = resolve(repoRoot, POLICY_FILENAME);

  if (!existsSync(policyPath)) {
    return DEFAULT_POLICY;
  }

  const raw = await readFile(policyPath, "utf8");
  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`${POLICY_FILENAME}: failed to parse JSON — ${String(err)}`);
  }

  return parsePolicy(parsed);
}
