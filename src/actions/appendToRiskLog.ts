import type { ClassifiedFinding } from "../shared/types";

export function appendToRiskLog(existingLog: string, finding: ClassifiedFinding): string {
  const entry = [
    `- ${finding.finding.packageName}`,
    `  - severity: ${finding.finding.severity}`,
    `  - decision: ${finding.decision}`,
    `  - reason: ${finding.reason}`,
  ].join("\n");

  if (existingLog.trim().length === 0) {
    return `${entry}\n`;
  }

  return `${existingLog.trimEnd()}\n${entry}\n`;
}