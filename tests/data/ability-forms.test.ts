import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { decodeChampionDetail } from "../../src/data/contracts/championDataDecoder";
import { decodeDataManifest } from "../../src/data/contracts/dataManifest";
import { DATA_LOCALES } from "../../src/data/contracts/staticData";
import { toChampion } from "../../src/data/mappers/championMapper";
import { comparisonCooldownAtRank, formCooldownAtRank } from "../../src/pages/VsPage/vsCooldownTable";
import { VersionedCache } from "../../src/data/cache/versionedCache";
import { ChampionRepository } from "../../src/data/repositories/championRepository";
import { staticDataIdentityKey } from "../../src/data/contracts/staticDataDecoder";

const release = decodeDataManifest(JSON.parse(readFileSync("public/data/version.json", "utf8")));
const readChampion = (id: string, locale = "ko_KR") => decodeChampionDetail(JSON.parse(readFileSync(`public/data/${release.patchVersion}/champions/${locale}/${id}.json`, "utf8")));
const expectedSlots = { Jayce: "QWER", Nidalee: "QWE", Elise: "QWER", Gnar: "QWE" };
for (const locale of DATA_LOCALES) {
  for (const [id, slots] of Object.entries(expectedSlots)) {
    test(`${locale} ${id} 형태별 스킬 구간`, () => {
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
        }
      }
    });
  }
}

const jayce = readChampion("Jayce").champion.abilities;

test("제이스 형태 이름", () => {
  assert.deepEqual(jayce.Q.forms?.map((form) => form.name), ["하늘로!", "전격 폭발"]);
  assert.deepEqual(jayce.R.forms?.map((form) => form.name), ["머큐리 캐논", "머큐리 해머"]);
});

for (const locale of DATA_LOCALES) {
  test(`${locale} 제이스 궁극기 양쪽 형태의 챔피언 레벨별 수치`, () => {
    const forms = readChampion("Jayce", locale).champion.abilities.R.forms!;
    const steps = (values: number[]) => values.flatMap((value) => Array(5).fill(value));
    assert.deepEqual(forms[0].levelValues?.map((entry) => entry.values), [steps([20, 25, 30, 35])]);
    assert.equal(forms[0].levelValues?.[0].percent, true);
    assert.deepEqual(forms[1].levelValues?.map((entry) => entry.values), [steps([5, 12, 19, 26]), steps([25, 60, 95, 130])]);
  });
}

test("제이스 형태별 쿨타임", () => {
  assert.equal(formCooldownAtRank(jayce.Q, jayce.Q.forms![0], 1), 16);
  assert.equal(formCooldownAtRank(jayce.Q, jayce.Q.forms![1], 6), 8);
  assert.equal(comparisonCooldownAtRank(jayce.Q, 1), 8);
  assert.equal(comparisonCooldownAtRank(jayce.Q, 1, "A"), 16);
  assert.equal(comparisonCooldownAtRank(jayce.Q, 1, "B"), 8);
  assert.equal(comparisonCooldownAtRank(jayce.R, 2, "B"), null);
});

test("니달리 형태 이름·랭크 출처", () => {
  const nidalee = readChampion("Nidalee").champion.abilities;
  assert.equal(nidalee.Q.forms![1].name, "숨통 끊기");
  assert.equal(nidalee.Q.forms![1].tooltipRankSource, "R");
  assert.match(nidalee.Q.forms![1].bodyHtml, /5\/30\/55\/80/);
});

test("나르 형태별 쿨타임", () => {
  const gnar = readChampion("Gnar").champion.abilities;
  assert.equal(formCooldownAtRank(gnar.W, gnar.W.forms![0], 1), null);
  assert.equal(formCooldownAtRank(gnar.W, gnar.W.forms![1], 1), 7);
});

test("디코더의 잘못된 형태 거부", () => {
  const invalid = readChampion("Jayce");
  invalid.champion.abilities.Q.forms![0].iconPath = "assets/characters/../../bad.png";
  assert.throws(() => decodeChampionDetail(invalid), /Invalid ability form/);
  invalid.champion.abilities.Q.forms = [jayce.Q.forms![0]];
  assert.throws(() => decodeChampionDetail(invalid), /Invalid ability forms/);
});

test("디코더의 잘못된 형태별 레벨 수치 거부", () => {
  const invalid = readChampion("Jayce");
  invalid.champion.abilities.R.forms![0].levelValues = [{ values: [20, 35], digits: 0, percent: true }];
  assert.throws(() => decodeChampionDetail(invalid), /Invalid ability level values/);
});

test("형태 도입 전 캐시 교체 후 재사용", async () => {
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
});
