/** 승인·현재 원문을 검증한 뒤 브라우저용 규칙만 내보낸다. 새 패치의 미승인 규칙은 제외한다. */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { reviewedAbilities } from "./retrieval";
import { readJson } from "./sources";
import { ROOT } from "./prepare";
import type { AbilityBundle } from "../../../../src/features/advisor/mechanics/types";
import { noteVersion } from "../../../../src/domain/knowledge/notes/noteVersion";

export async function buildMechanicBundle(root = ROOT): Promise<AbilityBundle> {
  const { patchVersion: patch } = await readJson<{ patchVersion: string }>(path.join(root, "public/data/version.json"));
  const index = await reviewedAbilities(root);
  const abilities = [...index.values()].map(({ job, draft }) => ({ job: {
    id: job.id, champion: job.champion, slot: job.slot, patch: job.patch, sourceHash: job.sourceHash,
    slotRole: job.slotRole, facts: { name: job.facts.name }, numbers: job.numbers.map(({ id, value, percent }) => ({ id, value, percent })), variants: job.variants,
  }, draft, version: noteVersion({}, { baselinePatch: patch, sourcePatch: job.patch, verifiedThroughPatch: job.patch }) }));
  const bundle: AbilityBundle = { schemaVersion: 2, patch, abilities };
  const file = path.join(root, "public/data", patch, "llm/champion-mechanics.json");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(bundle));
  console.log(`승인 스킬 규칙: ${abilities.length}개, ${new Set(abilities.map(a => a.job.champion)).size}챔피언, ${Buffer.byteLength(JSON.stringify(bundle))} bytes`);
  return bundle;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await buildMechanicBundle();
