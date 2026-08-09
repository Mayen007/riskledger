import type { AcceptedRiskEntry, ClassificationPolicy } from "../shared/types";
import { DEFAULT_POLICY } from "../classify/loadPolicy";

const POLICY_PATH = ".security-policy.json";

export interface PolicyFileClient {
  getContent: (input: {
    owner: string;
    repo: string;
    path: string;
  }) => Promise<{ data: unknown }>;
  createOrUpdateFileContents: (input: {
    owner: string;
    repo: string;
    path: string;
    message: string;
    content: string;
    sha?: string;
  }) => Promise<unknown>;
}

interface FileResponse {
  sha: string;
  content: string;
  encoding: string;
}

function isFileResponse(data: unknown): data is FileResponse {
  return (
    typeof data === "object" &&
    data !== null &&
    typeof (data as Record<string, unknown>)["sha"] === "string" &&
    typeof (data as Record<string, unknown>)["content"] === "string"
  );
}

/**
 * Fetches `.security-policy.json` from the repository, appends a new
 * `acceptedRisks` entry, and writes it back as a commit.
 *
 * - If the file does not yet exist (404), starts from DEFAULT_POLICY.
 * - All three required fields (`cve`, `reason`, `decidedBy`) must be present
 *   on the entry — enforced by the TypeScript type.
 */
export async function appendAcceptedRisk(
  client: PolicyFileClient,
  owner: string,
  repo: string,
  entry: AcceptedRiskEntry,
  committerLogin: string,
): Promise<void> {
  let existingPolicy: ClassificationPolicy = { ...DEFAULT_POLICY, acceptedRisks: [] };
  let existingSha: string | undefined;

  try {
    const { data } = await client.getContent({ owner, repo, path: POLICY_PATH });
    if (isFileResponse(data)) {
      existingSha = data.sha;
      const decoded = Buffer.from(data.content, "base64").toString("utf8");
      existingPolicy = JSON.parse(decoded) as ClassificationPolicy;
    }
  } catch (err) {
    // File doesn't exist yet — start from defaults. Any other error propagates.
    const status = (err as { status?: number }).status;
    if (status !== 404) {
      throw err;
    }
  }

  const updatedPolicy: ClassificationPolicy = {
    ...existingPolicy,
    acceptedRisks: [...(existingPolicy.acceptedRisks ?? []), entry],
  };

  const content = Buffer.from(JSON.stringify(updatedPolicy, null, 2) + "\n").toString("base64");

  await client.createOrUpdateFileContents({
    owner,
    repo,
    path: POLICY_PATH,
    message: [
      `chore(policy): accept ${entry.cve} via /accept command`,
      "",
      `Decided by: @${committerLogin}`,
      `Reason: ${entry.reason}`,
    ].join("\n"),
    content,
    sha: existingSha,
  });
}
