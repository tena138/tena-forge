import { cp, lstat, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, sep } from "node:path";

const nextDir = join(process.cwd(), ".next");

async function ensurePackageManifest(targetDir) {
  await mkdir(targetDir, { recursive: true });
  await writeFile(join(targetDir, "package.json"), "{}\n", { flag: "wx" }).catch((error) => {
    if (error?.code !== "EEXIST") {
      throw error;
    }
  });
}

await ensurePackageManifest(nextDir);

function shouldCopyNextOutput(source) {
  const relativePath = relative(nextDir, source);
  return relativePath !== "dev" && !relativePath.startsWith(`dev${sep}`);
}

if (basename(process.cwd()) === "frontend") {
  const parentDir = dirname(process.cwd());
  const parentNextDir = join(parentDir, ".next");
  await rm(parentNextDir, { recursive: true, force: true });
  await cp(nextDir, parentNextDir, { recursive: true, filter: shouldCopyNextOutput });
  await ensurePackageManifest(parentNextDir);

  const parentNodeModules = join(parentDir, "node_modules");
  const localNodeModules = join(process.cwd(), "node_modules");
  await lstat(parentNodeModules).catch(async (error) => {
    if (error?.code !== "ENOENT") {
      throw error;
    }
    await symlink(localNodeModules, parentNodeModules, process.platform === "win32" ? "junction" : "dir");
  });
}
