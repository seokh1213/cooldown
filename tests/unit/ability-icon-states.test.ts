import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { ABILITY_ICON_STATES } from "../../src/data/abilityIconStates";
import { loadThumbnailCatalog, createThumbnailJobs } from "../../scripts/data-pipeline/thumbnailCatalog";
import { formIconKey } from "../../scripts/data-pipeline/thumbnailArtifacts";
import { readFileSync } from "node:fs";
import { decodeDataManifest } from "../../src/data/contracts/dataManifest";

const version = decodeDataManifest(JSON.parse(readFileSync("public/data/version.json", "utf8")));

test("기본 상태 아이콘을 새 파일로 받고 같은 아이콘을 스킬 띠에도 넣는다", async () => {
  const catalog = await loadThumbnailCatalog("public/data", version.patchVersion, version.sources.cdragon);
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "cooldown-icon-states-"));
  try {
    const jobs = await createThumbnailJobs(catalog, out, version.sources.ddragon);
    for (const [key, state] of Object.entries(ABILITY_ICON_STATES)) {
      if (!state.thumbnailName) continue;
      const [champion, slot] = key.split(":");
      const index = ["P", "Q", "W", "E", "R"].indexOf(slot);
      assert.equal(catalog.abilityStrips.get(champion)?.[index], state.thumbnailName);
      assert.ok(jobs.some(job => job.file.endsWith(`/${state.thumbnailName}.webp`)
        && job.url === `https://raw.communitydragon.org/${version.sources.cdragon}/game/${state.defaultIconPath}`));
      const strip = await sharp(`public/img/${version.sources.ddragon}/ability/${champion}.webp`)
        .extract({ left: index * 64, top: 0, width: 64, height: 64 }).removeAlpha().raw().toBuffer();
      const single = await sharp(`public/img/${version.sources.ddragon}/spell/${state.thumbnailName}.webp`).removeAlpha().raw().toBuffer();
      assert.equal(strip.length, single.length);
      const mse = strip.reduce((sum, value, i) => sum + (value - single[i]) ** 2, 0) / strip.length;
      assert.ok(mse < 150, `${champion} ${slot} strip differs from its selected icon: ${mse}`);
    }
  } finally {
    await fs.rm(out, { recursive: true, force: true });
  }
});

test("징크스 Q는 서로 다른 A/B 무기 아이콘 두 장을 로컬에서 제공한다", async () => {
  const variants = ABILITY_ICON_STATES["Jinx:Q"].variants!;
  assert.deepEqual(variants.map(variant => variant.key), ["A", "B"]);
  const buffers = await Promise.all(variants.map(async variant => {
    const file = `public/img/${version.sources.ddragon}/form/${formIconKey(variant.iconPath)}.webp`;
    const metadata = await sharp(file).metadata();
    assert.equal(metadata.width, 64);
    assert.equal(metadata.height, 64);
    for (const lang of ["ko_KR", "en_US", "zh_CN"] as const) assert.ok(variant.labels[lang]);
    return fs.readFile(file);
  }));
  assert.ok(!buffers[0].equals(buffers[1]));
});
