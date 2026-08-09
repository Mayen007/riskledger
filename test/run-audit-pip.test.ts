import { runAuditPip } from "../src/audit/runAuditPip";
import { parsePipAuditReport } from "../src/audit/parsePipAuditReport";
import spawn from "cross-spawn";
import type { ChildProcess } from "node:child_process";
import { EventEmitter, Readable } from "node:stream";

jest.mock("cross-spawn");
jest.mock("../src/audit/parsePipAuditReport", () => ({
  parsePipAuditReport: jest.fn(),
}));

const mockedSpawn = jest.mocked(spawn);
const mockedParse = jest.mocked(parsePipAuditReport);

function makeChildProcess(stdout: string, exitCode: number = 0): ChildProcess {
  const child = new EventEmitter() as unknown as ChildProcess;
  const stdoutStream = new Readable({ read() {} });

  (child as unknown as Record<string, unknown>)["stdout"] = stdoutStream;

  // Emit stdout data and then close asynchronously
  process.nextTick(() => {
    stdoutStream.push(stdout);
    stdoutStream.push(null);
    child.emit("close", exitCode);
  });

  return child;
}

describe("runAuditPip", () => {
  beforeEach(() => {
    mockedSpawn.mockReset();
    mockedParse.mockReset();
  });

  it("calls pip-audit with --format=json and passes stdout to parsePipAuditReport", async () => {
    const fakeOutput = '[{"name":"Pillow","version":"9.0.0","vulns":[]}]';
    mockedSpawn.mockReturnValue(makeChildProcess(fakeOutput));
    mockedParse.mockReturnValue([]);

    await runAuditPip("/fake/cwd");

    expect(mockedSpawn).toHaveBeenCalledWith(
      "pip-audit",
      ["--format=json"],
      expect.objectContaining({ cwd: "/fake/cwd" }),
    );
    expect(mockedParse).toHaveBeenCalledWith(fakeOutput);
  });

  it("returns findings from parsePipAuditReport", async () => {
    const finding = {
      ecosystem: "pip" as const,
      packageName: "Pillow",
      severity: "moderate" as const,
      advisoryId: "GHSA-56pw-mpj4-fxww",
      title: "Arbitrary code execution",
      vulnerableVersions: "<9.0.1",
      fixAvailable: true,
      patchedVersions: ["9.0.1"],
    };

    mockedSpawn.mockReturnValue(makeChildProcess("[]"));
    mockedParse.mockReturnValue([finding]);

    const result = await runAuditPip("/fake/cwd");

    expect(result).toEqual([finding]);
  });

  it("resolves even when pip-audit exits non-zero (vulnerabilities found)", async () => {
    mockedSpawn.mockReturnValue(makeChildProcess("[]", 1));
    mockedParse.mockReturnValue([]);

    await expect(runAuditPip("/fake/cwd")).resolves.toEqual([]);
  });

  it("rejects when the child process emits an error event", async () => {
    const child = new EventEmitter() as unknown as ChildProcess;
    const stdoutStream = new Readable({ read() {} });
    (child as unknown as Record<string, unknown>)["stdout"] = stdoutStream;

    process.nextTick(() => {
      child.emit("error", new Error("spawn ENOENT"));
    });

    mockedSpawn.mockReturnValue(child);

    await expect(runAuditPip("/fake/cwd")).rejects.toThrow("spawn ENOENT");
  });
});
