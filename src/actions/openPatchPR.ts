import type { ClassifiedFinding, UpgradeType } from "../shared/types";

export interface PullRequestLabelWriter {
  addLabels?: (input: {
    owner: string;
    repo: string;
    issue_number: number;
    labels: string[];
  }) => Promise<unknown>;
}

export interface PullRequestWriter {
  create: (input: {
    owner: string;
    repo: string;
    title: string;
    body: string;
    head: string;
    base: string;
  }) => Promise<unknown>;
  list?: (input: {
    owner: string;
    repo: string;
    state: "open" | "closed" | "all";
    head: string;
    base: string;
  }) => Promise<{ data: Array<{ number: number }> }>;
  update?: (input: {
    owner: string;
    repo: string;
    pull_number: number;
    title: string;
    body: string;
  }) => Promise<unknown>;
}

export interface RepositoryRef {
  owner: string;
  repo: string;
}

export interface PatchBatch {
  branch: string;
  upgradeType: UpgradeType;
  findings: ClassifiedFinding[];
}

export function groupPatchableFindings(findings: ClassifiedFinding[]): PatchBatch[] {
  const compatible = findings.filter((finding) => finding.finding.upgradeType !== "major");
  const major = findings.filter((finding) => finding.finding.upgradeType === "major");
  const batches: PatchBatch[] = [];

  if (compatible.length > 0) {
    batches.push({ branch: "riskledger/patches", upgradeType: "compatible", findings: compatible });
  }

  for (const finding of major) {
    const packageSlug = finding.finding.packageName.replace(/[^a-zA-Z0-9-]+/g, "-").toLowerCase();
    batches.push({
      branch: `riskledger/patches-major-${packageSlug}`,
      upgradeType: "major",
      findings: [finding],
    });
  }

  return batches;
}

export async function openPatchPR(
  client: PullRequestWriter,
  repository: RepositoryRef,
  findings: ClassifiedFinding[],
  labelsClient?: PullRequestLabelWriter,
  branch = "riskledger/patches",
): Promise<unknown> {
  const titles = findings.map((finding) => `${finding.finding.packageName} (${finding.finding.severity})`);
  const advisories = findings.map((finding) => {
    const label = `${finding.finding.advisoryId}: ${finding.finding.title}`;
    return finding.finding.advisoryUrl ? `[${label}](${finding.finding.advisoryUrl})` : label;
  });
  const input = {
    owner: repository.owner,
    repo: repository.repo,
    title: `RiskLedger patch bundle for ${repository.owner}/${repository.repo}`,
    body: [
      "Patchable findings:",
      ...titles.map((title) => `- ${title}`),
      "",
      "Advisories:",
      ...advisories.map((advisory) => `- ${advisory}`),
      "",
      `Dependency files updated by ecosystem fixers: ${findings.map((finding) => finding.finding.packageName).join(", ")}`,
    ].join("\n"),
    head: branch,
    base: "main",
  };

  if (client.list && client.update) {
    const { data: existing } = await client.list({
      owner: repository.owner,
      repo: repository.repo,
      state: "open",
      head: `${repository.owner}:${branch}`,
      base: "main",
    });

    if (existing[0]) {
      const result = await client.update({
        owner: repository.owner,
        repo: repository.repo,
        pull_number: existing[0].number,
        title: input.title,
        body: input.body,
      });
      await labelsClient?.addLabels?.({
        owner: repository.owner,
        repo: repository.repo,
        issue_number: existing[0].number,
        labels: ["security", "auto-patch"],
      });
      return result;
    }
  }

  const result = await client.create(input);
  const created = result as { data?: { number?: number } };
  if (created.data?.number !== undefined) {
    await labelsClient?.addLabels?.({
      owner: repository.owner,
      repo: repository.repo,
      issue_number: created.data.number,
      labels: ["security", "auto-patch"],
    });
  }
  return result;
}