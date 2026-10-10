import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Job, Manifest } from "./contract";
import { digest, readJson } from "./sources";
import { validateDraft } from "./validate";
import { sourceNumbers } from "./numbers";

export async function checkDirectory(out: string, ids?: string[]) {
  const files = ids ? ids.map(id => `${id}.json`) : (await readdir(path.join(out, "candidates"))).filter(file => file.endsWith(".json"));
  const manifest = await readJson<Manifest>(path.join(out, "manifest.json"));
  const records = [];
  for (const file of files.sort()) {
    try {
      const job = await readJson<Job>(path.join(out, "inputs", file));
      const frozen = manifest.jobs.find(item => item.id === job.id);
      const { champion, slot, patch, slotRole, sources, variants, facts } = job;
      const actualHash = digest({ champion, slot, patch, slotRole, sources, variants, facts });
      if (!frozen || frozen.sourceHash !== actualHash || frozen.promptHash !== job.promptHash) throw new Error("Frozen input hash mismatch");
      if (digest(job.numbers) !== digest(sourceNumbers(job.sources))) throw new Error("Source number table mismatch");
      const draft = await readJson<unknown>(path.join(out, "candidates", file));
      const { valid, errors, warnings } = validateDraft(job, draft);
      records.push({ id: job.id, valid, errors, warnings });
    } catch (error) { records.push({ id: file.replace(/\.json$/, ""), valid: false, errors: [{ code: "read", detail: String(error) }], warnings: [] }); }
  }
  return { counts: { checked: records.length, valid: records.filter(record => record.valid).length }, records };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.resolve(process.argv[2] ?? "dev/research/champion-mechanics/26.19-v2");
  const report = await checkDirectory(out, process.argv.slice(3).length ? process.argv.slice(3) : undefined);
  if (process.argv.slice(3).length === 0) await writeFile(path.join(out, "reports/validation.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report));
  process.exitCode = report.counts.checked > 0 && report.counts.checked === report.counts.valid ? 0 : 1;
}
