import { appendAcceptedRisk } from "../src/actions/updatePolicyFile";

const BASE64_POLICY = Buffer.from(
  JSON.stringify({
    autoPatch: { minSeverity: "low", maxSeverity: "moderate" },
    autoMergePatchLevel: false,
    acceptedRisks: [],
  }) + "\n",
).toString("base64");

function makeClient(overrides: Partial<{
  getContent: jest.Mock;
  createOrUpdateFileContents: jest.Mock;
}> = {}) {
  return {
    getContent: jest.fn().mockResolvedValue({
      data: {
        sha: "abc123",
        content: BASE64_POLICY,
        encoding: "base64",
      },
    }),
    createOrUpdateFileContents: jest.fn().mockResolvedValue({}),
    ...overrides,
  };
}

describe("appendAcceptedRisk", () => {
  it("fetches the existing policy and writes back with the new entry", async () => {
    const client = makeClient();

    await appendAcceptedRisk(
      client,
      "owner",
      "repo",
      { cve: "GHSA-xxxx-yyyy-zzzz", reason: "Not applicable", decidedBy: "alice" },
      "alice",
    );

    expect(client.getContent).toHaveBeenCalledWith({
      owner: "owner",
      repo: "repo",
      path: ".security-policy.json",
    });

    expect(client.createOrUpdateFileContents).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: "owner",
        repo: "repo",
        path: ".security-policy.json",
        sha: "abc123",
        message: expect.stringContaining("GHSA-xxxx-yyyy-zzzz"),
      }),
    );

    // Verify the written content includes the new entry
    const written = client.createOrUpdateFileContents.mock.calls[0][0] as { content: string };
    const decoded = JSON.parse(Buffer.from(written.content, "base64").toString("utf8")) as {
      acceptedRisks: Array<{ cve: string; reason: string; decidedBy: string }>;
    };
    expect(decoded.acceptedRisks).toHaveLength(1);
    expect(decoded.acceptedRisks[0]).toEqual({
      cve: "GHSA-xxxx-yyyy-zzzz",
      reason: "Not applicable",
      decidedBy: "alice",
    });
  });

  it("creates the file from defaults when it does not exist (404)", async () => {
    const client = makeClient({
      getContent: jest.fn().mockRejectedValue({ status: 404 }),
    });

    await appendAcceptedRisk(
      client,
      "owner",
      "repo",
      { cve: "CVE-2023-9999", reason: "Test-only dependency", decidedBy: "bob" },
      "bob",
    );

    const written = client.createOrUpdateFileContents.mock.calls[0][0] as {
      content: string;
      sha?: string;
    };
    // No sha = create, not update
    expect(written.sha).toBeUndefined();

    const decoded = JSON.parse(Buffer.from(written.content, "base64").toString("utf8")) as {
      acceptedRisks: Array<{ cve: string }>;
    };
    expect(decoded.acceptedRisks).toHaveLength(1);
    expect(decoded.acceptedRisks[0]?.cve).toBe("CVE-2023-9999");
  });

  it("appends to an existing acceptedRisks list without removing prior entries", async () => {
    const existingPolicy = {
      autoPatch: { minSeverity: "low", maxSeverity: "moderate" },
      acceptedRisks: [
        { cve: "GHSA-old-entry-0001", reason: "Old reason", decidedBy: "carol" },
      ],
    };
    const client = makeClient({
      getContent: jest.fn().mockResolvedValue({
        data: {
          sha: "def456",
          content: Buffer.from(JSON.stringify(existingPolicy) + "\n").toString("base64"),
          encoding: "base64",
        },
      }),
    });

    await appendAcceptedRisk(
      client,
      "owner",
      "repo",
      { cve: "GHSA-new-entry-0002", reason: "New reason", decidedBy: "dave" },
      "dave",
    );

    const written = client.createOrUpdateFileContents.mock.calls[0][0] as { content: string };
    const decoded = JSON.parse(Buffer.from(written.content, "base64").toString("utf8")) as {
      acceptedRisks: Array<{ cve: string }>;
    };
    expect(decoded.acceptedRisks).toHaveLength(2);
    expect(decoded.acceptedRisks.map((e) => e.cve)).toEqual([
      "GHSA-old-entry-0001",
      "GHSA-new-entry-0002",
    ]);
  });

  it("re-throws non-404 errors from getContent", async () => {
    const client = makeClient({
      getContent: jest.fn().mockRejectedValue({ status: 500, message: "Internal Server Error" }),
    });

    await expect(
      appendAcceptedRisk(
        client,
        "owner",
        "repo",
        { cve: "GHSA-xxxx-yyyy-zzzz", reason: "Test", decidedBy: "alice" },
        "alice",
      ),
    ).rejects.toMatchObject({ status: 500 });
  });
});
