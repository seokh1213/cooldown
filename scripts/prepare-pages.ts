import path from "node:path";
import { fileURLToPath } from "node:url";
import { preparePagesArtifact } from "./data-pipeline/pages-artifact";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

await preparePagesArtifact(path.join(repositoryRoot, "dist"));
console.log("Prepared GitHub Pages route shells.");
