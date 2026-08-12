import { writeFile, mkdir } from "node:fs/promises";
import {
  badgeColor,
  badgeMessage,
  buildBadge,
  writeStatusBadge,
} from "../src/actions/writeStatusBadge";
import type { DigestStats } from "../src/shared/computeDigestStats";

jest.mock("node:fs/promises", () => ({
  writeFile: jest.fn(),
  mkdir: jest.fn(),
}));

const mockedWriteFile = jest.mocked(writeFile);
const mockedMkdir = jest.mocked(mkdir);

const zeroStats: DigestStats = { patchable: 0, needsReview: 0, acceptedRisk: 0, total: 0 };
const openStats: DigestStats = { patchable: 1, needsReview: 2, acceptedRisk: 1, total: 4 };

describe("badgeColor", () => {
  it("returns brightgreen when open=0 and no high/critical", () => {
    expect(badgeColor(zeroStats, false)).toBe("brightgreen");
  });

  it("returns red when hasHighOrCritical is true regardless of open count", () => {
    expect(badgeColor(zeroStats, true)).toBe("red");
    expect(badgeColor(openStats, true)).toBe("red");
  });

  it("returns yellow for 1-2 open findings without high/critical", () => {
    const stats: DigestStats = { patchable: 1, needsReview: 1, acceptedRisk: 0, total: 2 };
    expect(badgeColor(stats, false)).toBe("yellow");
  });

  it("returns orange for 3+ open findings without high/critical", () => {
    // openStats has patchable=1 + needsReview=2 = 3 open
    expect(badgeColor(openStats, false)).toBe("orange");
  });
});

describe("badgeMessage", () => {
  it("returns 'secure' when there are no open findings", () => {
    expect(badgeMessage(zeroStats)).toBe("secure");
    // acceptedRisk-only is also considered secure (no open)
    const accepted: DigestStats = { patchable: 0, needsReview: 0, acceptedRisk: 3, total: 3 };
    expect(badgeMessage(accepted)).toBe("secure");
  });

  it("returns '<N> open' for open findings", () => {
    // openStats: patchable=1 + needsReview=2 = 3 open
    expect(badgeMessage(openStats)).toBe("3 open");
  });
});

describe("buildBadge", () => {
  it("produces a valid shields.io endpoint schema v1 object", () => {
    const badge = buildBadge(zeroStats, false);
    expect(badge.schemaVersion).toBe(1);
    expect(badge.label).toBe("security");
    expect(badge.message).toBe("secure");
    expect(badge.color).toBe("brightgreen");
  });
});

describe("writeStatusBadge", () => {
  beforeEach(() => {
    mockedMkdir.mockResolvedValue(undefined);
    mockedWriteFile.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("creates .riskledger/ directory with recursive:true", async () => {
    await writeStatusBadge("/tmp/repo", zeroStats, false);
    expect(mockedMkdir).toHaveBeenCalledWith(
      expect.stringContaining(".riskledger"),
      { recursive: true },
    );
  });

  it("writes badge.json inside .riskledger/", async () => {
    await writeStatusBadge("/tmp/repo", zeroStats, false);
    const badgeCall = mockedWriteFile.mock.calls.find(
      ([p]) => String(p).endsWith("badge.json"),
    ) as [string, string, string] | undefined;
    expect(badgeCall).toBeDefined();
    const parsed = JSON.parse(badgeCall![1]) as unknown;
    expect(parsed).toMatchObject({ schemaVersion: 1, label: "security" });
  });

  it("writes stats.json inside .riskledger/ with full DigestStats and updatedAt", async () => {
    await writeStatusBadge("/tmp/repo", openStats, false);
    const statsCall = mockedWriteFile.mock.calls.find(
      ([p]) => String(p).endsWith("stats.json"),
    ) as [string, string, string] | undefined;
    expect(statsCall).toBeDefined();
    const parsed = JSON.parse(statsCall![1]) as {
      patchable: number;
      needsReview: number;
      acceptedRisk: number;
      total: number;
      updatedAt: string;
    };
    expect(parsed.patchable).toBe(openStats.patchable);
    expect(parsed.needsReview).toBe(openStats.needsReview);
    expect(parsed.acceptedRisk).toBe(openStats.acceptedRisk);
    expect(parsed.total).toBe(openStats.total);
    expect(new Date(parsed.updatedAt).toISOString()).toBe(parsed.updatedAt);
  });

  it("writes 'red' badge for high/critical findings", async () => {
    await writeStatusBadge("/tmp/repo", openStats, true);
    const badgeCall = mockedWriteFile.mock.calls.find(
      ([p]) => String(p).endsWith("badge.json"),
    ) as [string, string, string] | undefined;
    const parsed = JSON.parse(badgeCall![1]) as { color: string };
    expect(parsed.color).toBe("red");
  });

  it("writes 'brightgreen' badge when no open findings", async () => {
    await writeStatusBadge("/tmp/repo", zeroStats, false);
    const badgeCall = mockedWriteFile.mock.calls.find(
      ([p]) => String(p).endsWith("badge.json"),
    ) as [string, string, string] | undefined;
    const parsed = JSON.parse(badgeCall![1]) as { color: string; message: string };
    expect(parsed.color).toBe("brightgreen");
    expect(parsed.message).toBe("secure");
  });
});
