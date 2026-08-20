import type { ClassificationPolicy } from "../shared/types";
import { parsePolicy } from "../classify/loadPolicy";

const ORG_CONFIG_REPO = ".github";
const POLICY_FILENAME = ".security-policy.json";

export interface OrgPolicyClient {
  getContent: (params: {
    owner: string;
    repo: string;
    path: string;
  }) => Promise<{ data: unknown }>;
}

interface FileContentResponse {
  type?: string;
  encoding?: string;
  content?: string;
}

function isFileContentResponse(data: unknown): data is FileContentResponse {
  return (
    typeof data === "object" &&
    data !== null &&
    !Array.isArray(data) &&
    typeof (data as Record<string, unknown>)["content"] === "string"
  );
}

/**
 * Attempts to fetch `.security-policy.json` from the organization's central
 * `.github` repository (`<owner>/.github/.security-policy.json`).
 *
 * - Returns the parsed `ClassificationPolicy` if present.
 * - Returns `null` if the `.github` repository or `.security-policy.json` file does not exist (404).
 * - Throws if the policy file is malformed (loud failure per project rules).
 */
export async function fetchOrgPolicy(
  client: OrgPolicyClient,
  owner: string,
): Promise<ClassificationPolicy | null> {
  try {
    const response = await client.getContent({
      owner,
      repo: ORG_CONFIG_REPO,
      path: POLICY_FILENAME,
    });

    if (!isFileContentResponse(response.data) || !response.data.content) {
      return null;
    }

    const decoded = Buffer.from(response.data.content, "base64").toString("utf8");
    const parsed = JSON.parse(decoded) as unknown;
    return parsePolicy(parsed);
  } catch (error: unknown) {
    const status = (error as { status?: number }).status;
    if (status === 404) {
      return null;
    }

    throw error;
  }
}
