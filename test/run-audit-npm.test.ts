import { EventEmitter } from "node:events";

import spawn from "cross-spawn";
import { runAuditNpm } from "../src/audit/runAuditNpm";

jest.mock("cross-spawn", () => ({
  __esModule: true,
  default: jest.fn(),
}));

describe("runAuditNpm", () => {
  it("parses npm audit output from the local project directory", async () => {
    const spawnMock = jest.mocked(spawn);
    const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter };
    child.stdout = new EventEmitter();

    spawnMock.mockReturnValue(child as never);

    const promise = runAuditNpm("c:/tmp/project");

    child.stdout.emit(
      "data",
      JSON.stringify({
        vulnerabilities: {
          demo: {
            severity: "low",
            title: "demo",
            vulnerable_versions: "<1.0.0",
            patched_versions: ">=1.0.0",
            fix_available: true,
          },
        },
      }),
    );
    child.emit("close", 0);

    await expect(promise).resolves.toEqual([
      {
        ecosystem: "npm",
        packageName: "demo",
        severity: "low",
        advisoryId: 1,
        title: "demo",
        vulnerableVersions: "<1.0.0",
        fixAvailable: true,
        patchedVersions: [">=1.0.0"],
      },
    ]);
  });

  it("still resolves when npm audit exits non-zero after finding vulnerabilities", async () => {
    const spawnMock = jest.mocked(spawn);
    const child = new EventEmitter() as EventEmitter & { stdout: EventEmitter };
    child.stdout = new EventEmitter();

    spawnMock.mockReturnValue(child as never);

    const promise = runAuditNpm("c:/tmp/project");

    child.stdout.emit(
      "data",
      JSON.stringify({
        vulnerabilities: {
          demo: {
            severity: "high",
            title: "demo",
            vulnerable_versions: "<2.0.0",
            patched_versions: ">=2.0.0",
            fix_available: true,
          },
        },
      }),
    );
    child.emit("close", 1);

    await expect(promise).resolves.toEqual([
      {
        ecosystem: "npm",
        packageName: "demo",
        severity: "high",
        advisoryId: 1,
        title: "demo",
        vulnerableVersions: "<2.0.0",
        fixAvailable: true,
        patchedVersions: [">=2.0.0"],
      },
    ]);
  });
});