import * as fs from "node:fs";
import path from "node:path";

const GENERATED_FILES = ["spriteSheets.ts", "assetVersion.ts"];

function installArtifacts(artifacts: Array<{ source: string; target: string }>, stagingDirectory: string): void {
  const installed: Array<{ target: string; backup: string; hadPrevious: boolean; installed: boolean }> = [];
  try {
    for (const [index, artifact] of artifacts.entries()) {
      const backup = path.join(stagingDirectory, `previous-${index}`);
      const hadPrevious = fs.existsSync(artifact.target);
      if (hadPrevious) fs.renameSync(artifact.target, backup);
      const operation = { target: artifact.target, backup, hadPrevious, installed: false };
      installed.push(operation);
      fs.renameSync(artifact.source, artifact.target);
      operation.installed = true;
    }
  } catch (error) {
    for (const operation of installed.reverse()) {
      if (operation.installed) fs.rmSync(operation.target, { recursive: true, force: true });
      if (operation.hadPrevious) fs.renameSync(operation.backup, operation.target);
    }
    throw error;
  }
}

export async function publishThumbnails(
  repositoryRoot: string,
  ddragonVersion: string,
  generate: (directories: { out: string; generatedDirectory: string }) => Promise<void>,
): Promise<void> {
  const imageRoot = path.join(repositoryRoot, "public/img");
  fs.mkdirSync(imageRoot, { recursive: true });
  const stagingDirectory = fs.mkdtempSync(path.join(imageRoot, ".generation-"));
  const out = path.join(stagingDirectory, ddragonVersion);
  const generatedDirectory = path.join(stagingDirectory, "generated");
  const target = path.join(imageRoot, ddragonVersion);
  let published = false;
  try {
    if (fs.existsSync(target)) fs.cpSync(target, out, { recursive: true });
    fs.mkdirSync(generatedDirectory, { recursive: true });
    await generate({ out, generatedDirectory });
    const targetGeneratedDirectory = path.join(repositoryRoot, "src/infrastructure/generated");
    fs.mkdirSync(targetGeneratedDirectory, { recursive: true });
    installArtifacts([
      { source: out, target },
      ...GENERATED_FILES.map((name) => ({
        source: path.join(generatedDirectory, name),
        target: path.join(targetGeneratedDirectory, name),
      })),
    ], stagingDirectory);
    published = true;
    for (const entry of fs.readdirSync(imageRoot, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== ddragonVersion && /^\d+\.\d+\.\d+$/.test(entry.name)) {
        fs.rmSync(path.join(imageRoot, entry.name), { recursive: true, force: true });
      }
    }
  } finally {
    // Retain backups if a filesystem error prevents rollback as well as publication.
    const backupsRemain = [0, 1, 2].some((index) => fs.existsSync(path.join(stagingDirectory, `previous-${index}`)));
    if (published || !backupsRemain) fs.rmSync(stagingDirectory, { recursive: true, force: true });
  }
}
