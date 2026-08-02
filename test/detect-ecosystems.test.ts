import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectEcosystems } from "../src/audit/detectEcosystems";

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "riskledger-test-"));
}

describe("detectEcosystems", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await makeTempDir();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns [npm] when only package.json is present", async () => {
    await writeFile(join(tempDir, "package.json"), "{}");

    const result = await detectEcosystems(tempDir);

    expect(result).toEqual(["npm"]);
  });

  it("returns [pip] when only requirements.txt is present", async () => {
    await writeFile(join(tempDir, "requirements.txt"), "requests==2.31.0\n");

    const result = await detectEcosystems(tempDir);

    expect(result).toEqual(["pip"]);
  });

  it("returns [pip] when only pyproject.toml is present", async () => {
    await writeFile(join(tempDir, "pyproject.toml"), "[tool.poetry]\n");

    const result = await detectEcosystems(tempDir);

    expect(result).toEqual(["pip"]);
  });

  it("returns [npm, pip] when both package.json and requirements.txt are present", async () => {
    await writeFile(join(tempDir, "package.json"), "{}");
    await writeFile(join(tempDir, "requirements.txt"), "requests==2.31.0\n");

    const result = await detectEcosystems(tempDir);

    expect(result).toEqual(["npm", "pip"]);
  });

  it("returns [npm, pip] when both package.json and pyproject.toml are present", async () => {
    await writeFile(join(tempDir, "package.json"), "{}");
    await writeFile(join(tempDir, "pyproject.toml"), "[tool.poetry]\n");

    const result = await detectEcosystems(tempDir);

    expect(result).toEqual(["npm", "pip"]);
  });

  it("returns [] when no known manifest files are present", async () => {
    const result = await detectEcosystems(tempDir);

    expect(result).toEqual([]);
  });
});
