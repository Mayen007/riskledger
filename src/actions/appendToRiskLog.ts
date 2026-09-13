import type { AcceptedRiskEntry } from "../shared/types";

export function appendToRiskLog(existingLog: string, risk: AcceptedRiskEntry): string {
  if (!risk.cve || !risk.reason || !risk.decidedBy) {
    throw new Error("Accepted-risk log entries require cve, reason, and decidedBy");
  }

  const entry = [
    `- advisory: ${risk.cve}`,
    "  - decision: accepted-risk",
    `  - reason: ${risk.reason}`,
    `  - decidedBy: ${risk.decidedBy}`,
  ].join("\n");

  if (existingLog.trim().length === 0) {
    return `${entry}\n`;
  }

  return `${existingLog.trimEnd()}\n${entry}\n`;
}