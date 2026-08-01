import spawn from "cross-spawn";

import { parseNpmAuditReport } from "./parseNpmAuditReport";
import type { AuditFinding } from "../shared/types";

function getNpmCommand(): string {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

export async function runAuditNpm(cwd: string): Promise<AuditFinding[]> {
  const stdout = await new Promise<string>((resolve, reject) => {
    const child = spawn(getNpmCommand(), ["audit", "--json"], { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let standardOutput = "";

    child.stdout?.on("data", (chunk: Buffer | string) => {
      standardOutput += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", () => {
      resolve(standardOutput);
    });
  });

  return parseNpmAuditReport(stdout);
}