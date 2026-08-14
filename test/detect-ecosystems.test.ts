import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectEcosystems, findManifestDirectories } from "../src/audit/detectEcosystems";

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "riskledger-test-"));
}

describe("detectEcosystems and findManifestDirectories", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await makeTempDir();
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns [npm] when only package.json is present at root", async () => {
    await writeFile(join(tempDir, "package.json"), "{}");

    const result = await detectEcosystems(tempDir);

    expect(result).toEqual(["npm"]);
  });

  it("returns [pip] when only requirements.txt is present at root", async () => {
    await writeFile(join(tempDir, "requirements.txt"), "requests==2.31.0\n");

    const result = await detectEcosystems(tempDir);

    expect(result).toEqual(["pip"]);
  });

  it("returns [pip] when only pyproject.toml is present at root", async () => {
    await writeFile(join(tempDir, "pyproject.toml"), "[tool.poetry]\n");

    const result = await detectEcosystems(tempDir);

    expect(result).toEqual(["pip"]);
  });

  it("returns [npm, pip] when both package.json and requirements.txt are present at root", async () => {
    await writeFile(join(tempDir, "package.json"), "{}");
    await writeFile(join(tempDir, "requirements.txt"), "requests==2.31.0\n");

    const result = await detectEcosystems(tempDir);

    expect(result).toEqual(["npm", "pip"]);
  });

  it("returns [npm, pip] when both package.json and pyproject.toml are present at root", async () => {
    await writeFile(join(tempDir, "package.json"), "{}");
    await writeFile(join(tempDir, "pyproject.toml"), "[tool.poetry]\n");

    const result = await detectEcosystems(tempDir);

    expect(result).toEqual(["npm", "pip"]);
  });

  it("returns [] when no known manifest files are present", async () => {
    const result = await detectEcosystems(tempDir);

    expect(result).toEqual([]);
  });

  it("detects manifests in subdirectories (e.g. client/ and server/)", async () => {
    const clientDir = join(tempDir, "client");
    const serverDir = join(tempDir, "server");
    await mkdir(clientDir, { recursive: true });
    await mkdir(serverDir, { recursive: true });
    await writeFile(join(clientDir, "package.json"), "{}");
    await writeFile(join(serverDir, "package.json"), "{}");

    const ecosystems = await detectEcosystems(tempDir);
    expect(ecosystems).toEqual(["npm"]);

    const manifests = await findManifestDirectories(tempDir);
    expect(manifests.npm).toContain(clientDir);
    expect(manifests.npm).toContain(serverDir);
    expect(manifests.npm).toHaveLength(2);
    expect(manifests.pip).toHaveLength(0);
  });

  it("detects mixed multi-ecosystem subdirectories (e.g. frontend npm and backend pip)", async () => {
    const frontendDir = join(tempDir, "frontend");
    const backendDir = join(tempDir, "backend");
    await mkdir(frontendDir, { recursive: true });
    await mkdir(backendDir, { recursive: true });
    await writeFile(join(frontendDir, "package.json"), "{}");
    await writeFile(join(backendDir, "requirements.txt"), "flask==3.0.0\n");

    const ecosystems = await detectEcosystems(tempDir);
    expect(ecosystems).toEqual(expect.arrayContaining(["npm", "pip"]));

    const manifests = await findManifestDirectories(tempDir);
    expect(manifests.npm).toEqual([frontendDir]);
    expect(manifests.pip).toEqual([backendDir]);
  });

  it("ignores node_modules, .git, and build directories", async () => {
    const nodeModulesDir = join(tempDir, "node_modules", "some-pkg");
    const gitDir = join(tempDir, ".git");
    const distDir = join(tempDir, "dist");
    await mkdir(nodeModulesDir, { recursive: true });
    await mkdir(gitDir, { recursive: true });
    await mkdir(distDir, { recursive: true });

    await writeFile(join(nodeModulesDir, "package.json"), "{}");
    await writeFile(join(distDir, "package.json"), "{}");

    const ecosystems = await detectEcosystems(tempDir);
    expect(ecosystems).toEqual([]);

    const manifests = await findManifestDirectories(tempDir);
    expect(manifests.npm).toHaveLength(0);
    expect(manifests.pip).toHaveLength(0);
  });

  it("respects maxDepth limit", async () => {
    const deepDir = join(tempDir, "l1", "l2", "l3", "l4", "l5", "l6");
    await mkdir(deepDir, { recursive: true });
    await writeFile(join(deepDir, "package.json"), "{}");

    const manifests = await findManifestDirectories(tempDir, 3);
    expect(manifests.npm).toHaveLength(0);
  });
});

