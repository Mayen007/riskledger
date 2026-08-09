import spawn from "cross-spawn";
import { parsePipAuditReport } from "./parsePipAuditReport";
import type { AuditFinding } from "../shared/types";

/**
 * Shells out to `pip-audit --format=json` in the given directory and returns
 * the findings as a normalized `AuditFinding[]`.
 *
 * Like `runAuditNpm`, non-zero exit codes are expected when vulnerabilities are
 * found — we parse stdout regardless and only reject on a process error event
 * or a JSON parse failure inside `parsePipAuditReport`.
 */
export async function runAuditPip(cwd: string): Promise<AuditFinding[]> {
  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn("pip-audit", ["--format=json"], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let standardOutput = "";

    child.stdout?.on("data", (chunk: Buffer | string) => {
      standardOutput += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", () => {
      resolve(standardOutput);
    });
  });

  return parsePipAuditReport(stdout);
}
