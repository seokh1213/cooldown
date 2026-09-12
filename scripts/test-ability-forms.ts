import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { decodeChampionDetail } from "../src/data/contracts/championDataDecoder";
import { decodeDataManifest } from "../src/data/contracts/dataManifest";
import { DATA_LOCALES } from "../src/data/contracts/staticData";
import { toChampion } from "../src/data/mappers/championMapper";
import { comparisonCooldownAtRank, formCooldownAtRank } from "../src/pages/VsPage/vsCooldownTable";
import { VersionedCache } from "../src/data/cache/versionedCache";
import { ChampionRepository } from "../src/data/repositories/championRepository";
import { staticDataIdentityKey } from "../src/data/contracts/staticDataDecoder";

const release = decodeDataManifest(JSON.parse(readFileSync("public/data/version.json", "utf8")));
const readChampion = (id: string, locale = "ko_KR") => decodeChampionDetail(JSON.parse(readFileSync(`public/data/${release.patchVersion}/champions/${locale}/${id}.json`, "utf8")));
const expectedSlots = { Jayce: "QWER", Nidalee: "QWE", Elise: "QWER", Gnar: "QWE" };
let sections = 0;
for (const locale of DATA_LOCALES) {
  for (const [id, slots] of Object.entries(expectedSlots)) {
    const detail = readChampion(id, locale);
    assert.equal(toChampion(detail).spells?.[0].forms, detail.champion.abilities.Q.forms);
    for (const [slot, ability] of Object.entries(detail.champion.abilities)) {
      assert.equal(Boolean(ability.forms), slots.includes(slot), `${id} ${slot} form coverage`);
      if (!ability.forms) continue;
      assert.deepEqual(ability.forms.map((form) => form.key), ["A", "B"]);
      assert.notEqual(ability.forms[0].bodyHtml, ability.forms[1].bodyHtml);
      assert.notEqual(ability.forms[0].name, ability.forms[1].name);
      for (const form of ability.forms) {
        assert.equal(form.iconVersion, release.sources.cdragon);
        assert.deepEqual(form.diagnostics.unresolvedTokens, [], `${locale} ${id} ${slot} ${form.key}`);
        assert.doesNotMatch(form.bodyHtml, /\{\{|@[a-z_]/i);
        assert.ok(form.bodyHtml.length > 30);
        sections++;
      }
    }
  }
}
const jayce = readChampion("Jayce").champion.abilities;
assert.deepEqual(jayce.Q.forms?.map((form) => form.name), ["하늘로!", "전격 폭발"]);
assert.deepEqual(jayce.R.forms?.map((form) => form.name), ["머큐리 캐논", "머큐리 해머"]);
assert.equal(formCooldownAtRank(jayce.Q, jayce.Q.forms![0], 1), 16);
assert.equal(formCooldownAtRank(jayce.Q, jayce.Q.forms![1], 6), 8);
assert.equal(comparisonCooldownAtRank(jayce.Q, 1), 8);
assert.equal(comparisonCooldownAtRank(jayce.Q, 1, "A"), 16);
assert.equal(comparisonCooldownAtRank(jayce.Q, 1, "B"), 8);
assert.equal(comparisonCooldownAtRank(jayce.R, 2, "B"), null);
const nidalee = readChampion("Nidalee").champion.abilities;
assert.equal(nidalee.Q.forms![1].name, "숨통 끊기");
assert.equal(nidalee.Q.forms![1].tooltipRankSource, "R");
assert.match(nidalee.Q.forms![1].bodyHtml, /5\/30\/55\/80/);
const gnar = readChampion("Gnar").champion.abilities;
assert.equal(formCooldownAtRank(gnar.W, gnar.W.forms![0], 1), null);
assert.equal(formCooldownAtRank(gnar.W, gnar.W.forms![1], 1), 7);
const invalid = readChampion("Jayce");
invalid.champion.abilities.Q.forms![0].iconPath = "assets/characters/../../bad.png";
assert.throws(() => decodeChampionDetail(invalid), /Invalid ability form/);
invalid.champion.abilities.Q.forms = [jayce.Q.forms![0]];
assert.throws(() => decodeChampionDetail(invalid), /Invalid ability forms/);

const current = readChampion("Jayce");
const stale = structuredClone(current);
for (const ability of Object.values(stale.champion.abilities)) delete ability.forms;
const cache = new VersionedCache("test:forms");
cache.set(`champions:${staticDataIdentityKey(release)}:ko_KR:Jayce`, stale);
let requests = 0;
const repository = new ChampionRepository({ async getJson() { requests++; return current; } }, cache);
assert.ok((await repository.getDetail(release, "ko_KR", "Jayce")).champion.abilities.Q.forms);
await repository.getDetail(release, "ko_KR", "Jayce");
assert.equal(requests, 1, "pre-form cached data must be replaced, then reused");
console.log(`✅ ${sections} localized form sections, names, rank sources, cooldowns and decoder boundaries passed`);
