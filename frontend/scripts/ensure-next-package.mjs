import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

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

if (basename(process.cwd()) === "frontend") {
  const parentNextDir = join(dirname(process.cwd()), ".next");
  await rm(parentNextDir, { recursive: true, force: true });
  await cp(nextDir, parentNextDir, { recursive: true });
  await ensurePackageManifest(parentNextDir);
}
