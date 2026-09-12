import assert from "node:assert/strict";
import { decodeChampionProfile } from "../src/data/contracts/championProfile";
import { GameDataRepository } from "../src/data/repositories/gameDataRepository";
import { VersionedCache } from "../src/data/cache/versionedCache";
import { buildChampionProfile } from "./data-pipeline/champion-profile";
import { getStatFields } from "../src/components/features/ChampionComparison/constants";
import { championSplashUrl } from "../src/data/assets/riotAssetUrls";

const metadata = { schemaVersion: 2, patchVersion: "26.18", sources: { ddragon: "16.18.1", cdragon: "16.18" }, locale: "ko_KR" } as const;
const champion = { id: "Aatrox", key: "266", name: "아트록스", title: "다르킨의 검", lore: "<p>한때 수호자 &amp; 전사</p>", skins: [{ num: 0, name: "default" }, { num: 7, name: "핏빛달" }, { num: 8, name: "크로마", parentSkin: 7 }] };
const profile = buildChampionProfile({ ...metadata, champion });
assert.equal(profile.champion.lore, "한때 수호자 & 전사");
assert.deepEqual(profile.champion.skins.map((skin) => skin.num), [0, 7]);
assert.equal(championSplashUrl("Aatrox", profile.champion.skins[1].num), "https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Aatrox_7.jpg");
assert.equal(decodeChampionProfile(profile), profile);
assert.throws(() => decodeChampionProfile(null));
for (const invalid of [
  { ...profile, schemaVersion: 1 },
  { ...profile, champion: { ...profile.champion, id: "../Aatrox" } },
  { ...profile, champion: { ...profile.champion, lore: null } },
  ...[-1, 0.5, Infinity, "0"].map((num) => ({ ...profile, champion: { ...profile.champion, skins: [{ num, name: "bad" }] } })),
  { ...profile, champion: { ...profile.champion, skins: [{ num: 0, name: "one" }, { num: 0, name: "two" }] } },
]) assert.throws(() => decodeChampionProfile(invalid));

let requests = 0;
const repository = new GameDataRepository({ async getJson(path) {
  requests += 1;
  assert.equal(path, "data/26.18/champion-profiles/ko_KR/Aatrox.json");
  return profile;
} }, new VersionedCache("profile:test"));
const [first, second] = await Promise.all([
  repository.getChampionProfile(metadata, "ko_KR", "Aatrox"),
  repository.getChampionProfile(metadata, "ko_KR", "Aatrox"),
]);
assert.equal(first, second);
await repository.getChampionProfile(metadata, "ko_KR", "Aatrox");
assert.equal(requests, 1);
await assert.rejects(repository.getChampionProfile(metadata, "ko_KR", "../Unknown"), /Invalid champion id/);
assert.equal(requests, 1);
for (const mismatched of [
  { ...profile, champion: { ...profile.champion, id: "Fiora" } },
  { ...profile, locale: "en_US" },
  { ...profile, sources: { ddragon: "16.17.1", cdragon: "16.17" } },
]) {
  const repo = new GameDataRepository({ async getJson() { return mismatched; } }, new VersionedCache("profile:mismatch"));
  await assert.rejects(repo.getChampionProfile(metadata, "ko_KR", "Aatrox"), /mismatch/);
}
let attempt = 0;
const retrying = new GameDataRepository({ async getJson() {
  if (++attempt === 1) throw new Error("offline");
  return profile;
} }, new VersionedCache("profile:retry"));
await assert.rejects(retrying.getChampionProfile(metadata, "ko_KR", "Aatrox"), /offline/);
assert.equal((await retrying.getChampionProfile(metadata, "ko_KR", "Aatrox")).champion.id, "Aatrox");
for (const locale of ["ko_KR", "en_US", "zh_CN"] as const) {
  const fields = getStatFields(locale);
  assert.equal(fields.length, 11);
  assert.ok(fields.every((field) => !field.key.endsWith("perlevel")));
  assert.equal(fields.find((field) => field.key === "hp")?.growthKey, "hpperlevel");
  const speed = fields.find((field) => field.key === "attackspeed")!;
  assert.equal(speed.format(0.651), "0.651");
  assert.equal(speed.growthFormat?.(2.5), "2.5%");
  assert.equal(speed.growthFormat?.(0), "0%");
}
console.log("✅ Champion profiles, skin filtering, repository validation/retry, and base + growth stats passed");
