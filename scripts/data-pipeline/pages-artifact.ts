import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROUTES = ["encyclopedia", "simulation"] as const;

export async function preparePagesArtifact(distDirectory: string): Promise<void> {
  const indexPath = path.join(distDirectory, "index.html");
  await readFile(indexPath);

  await Promise.all(
    ROUTES.map(async (route) => {
      const routeDirectory = path.join(distDirectory, route);
      await mkdir(routeDirectory, { recursive: true });
      await copyFile(indexPath, path.join(routeDirectory, "index.html"));
    }),
  );

  await copyFile(indexPath, path.join(distDirectory, "404.html"));
  await writeFile(path.join(distDirectory, ".nojekyll"), "");
}
