import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const nextDir = join(process.cwd(), ".next");
const packagePath = join(nextDir, "package.json");

await mkdir(nextDir, { recursive: true });
await writeFile(packagePath, "{}\n", { flag: "wx" }).catch((error) => {
  if (error?.code !== "EEXIST") {
    throw error;
  }
});
