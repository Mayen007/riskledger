import { fetchOrgPolicy } from "../src/actions/fetchOrgPolicy";

describe("fetchOrgPolicy", () => {
  it("fetches, decodes, and parses policy from <owner>/.github/.security-policy.json", async () => {
    const validPolicy = {
      autoPatch: { minSeverity: "low", maxSeverity: "moderate" },
      autoMergePatchLevel: true,
      acceptedRisks: [{ cve: "GHSA-org-1", reason: "Org level accept", decidedBy: "security-team" }],
    };
    const base64Content = Buffer.from(JSON.stringify(validPolicy)).toString("base64");

    const mockClient = {
      getContent: jest.fn().mockResolvedValue({
        data: {
          type: "file",
          encoding: "base64",
          content: base64Content,
        },
      }),
    };

    const policy = await fetchOrgPolicy(mockClient, "my-org");

    expect(mockClient.getContent).toHaveBeenCalledWith({
      owner: "my-org",
      repo: ".github",
      path: ".security-policy.json",
    });
    expect(policy).toEqual(validPolicy);
  });

  it("returns null when the org config repo or policy file does not exist (404)", async () => {
    const mockClient = {
      getContent: jest.fn().mockRejectedValue({ status: 404 }),
    };

    const policy = await fetchOrgPolicy(mockClient, "my-org");
    expect(policy).toBeNull();
  });

  it("re-throws unexpected server errors (500)", async () => {
    const mockClient = {
      getContent: jest.fn().mockRejectedValue({ status: 500, message: "Internal server error" }),
    };

    await expect(fetchOrgPolicy(mockClient, "my-org")).rejects.toMatchObject({ status: 500 });
  });

  it("throws when the fetched org policy is invalid JSON", async () => {
    const mockClient = {
      getContent: jest.fn().mockResolvedValue({
        data: {
          type: "file",
          encoding: "base64",
          content: Buffer.from("invalid json content").toString("base64"),
        },
      }),
    };

    await expect(fetchOrgPolicy(mockClient, "my-org")).rejects.toThrow();
  });
});
