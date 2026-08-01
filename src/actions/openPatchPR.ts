import type { ClassifiedFinding } from "../shared/types";

export interface PullRequestWriter {
  create: (input: {
    owner: string;
    repo: string;
    title: string;
    body: string;
    head: string;
    base: string;
  }) => Promise<unknown>;
}

export interface RepositoryRef {
  owner: string;
  repo: string;
}

export async function openPatchPR(
  client: PullRequestWriter,
  repository: RepositoryRef,
  findings: ClassifiedFinding[],
): Promise<unknown> {
  const titles = findings.map((finding) => `${finding.finding.packageName} (${finding.finding.severity})`);
  return client.create({
    owner: repository.owner,
    repo: repository.repo,
    title: `RiskLedger patch bundle for ${repository.owner}/${repository.repo}`,
    body: [`Patchable findings:`, ...titles.map((title) => `- ${title}`)].join("\n"),
    head: "riskledger/patches",
    base: "main",
  });
}