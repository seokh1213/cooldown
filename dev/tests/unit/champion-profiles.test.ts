import assert from "node:assert/strict";
import { test } from "node:test";
import { decodeChampionProfile } from "../../../src/domain/game/contracts/championProfile";
import { GameDataRepository } from "../../../src/infrastructure/repositories/gameDataRepository";
import { VersionedCache } from "../../../src/infrastructure/cache/versionedCache";
import { buildChampionProfile } from "../../scripts/data-pipeline/champion-profile";
import { getStatFields } from "../../../src/features/champions/comparison/constants";
import { championSplashUrl } from "../../../src/infrastructure/assets/riotAssetUrls";

const metadata = { schemaVersion: 2, patchVersion: "26.18", sources: { ddragon: "16.18.1", cdragon: "16.18" }, locale: "ko_KR" } as const;
const champion = { id: "Aatrox", key: "266", name: "아트록스", title: "다르킨의 검", lore: "<p>한때 수호자 &amp; 전사</p>", skins: [{ num: 0, name: "default" }, { num: 7, name: "핏빛달" }, { num: 8, name: "크로마", parentSkin: 7 }] };
const profile = buildChampionProfile({ ...metadata, champion });

test("프로필 생성은 lore 를 정리하고 크로마 스킨을 거른다", () => {
  assert.equal(profile.champion.lore, "한때 수호자 & 전사");
  assert.deepEqual(profile.champion.skins.map((skin) => skin.num), [0, 7]);
  assert.equal(championSplashUrl("Aatrox", profile.champion.skins[1].num), "https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Aatrox_7.jpg");
});

test("프로필 디코더는 올바른 값을 통과시키고 잘못된 값을 거부한다", () => {
  assert.equal(decodeChampionProfile(profile), profile);
  assert.throws(() => decodeChampionProfile(null));
  for (const invalid of [
    { ...profile, schemaVersion: 1 },
    { ...profile, champion: { ...profile.champion, id: "../Aatrox" } },
    { ...profile, champion: { ...profile.champion, lore: null } },
    ...[-1, 0.5, Infinity, "0"].map((num) => ({ ...profile, champion: { ...profile.champion, skins: [{ num, name: "bad" }] } })),
    { ...profile, champion: { ...profile.champion, skins: [{ num: 0, name: "one" }, { num: 0, name: "two" }] } },
  ]) assert.throws(() => decodeChampionProfile(invalid));
});

test("저장소는 동시 요청을 합치고 캐시하며 잘못된 id 를 거부한다", async () => {
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
});

test("저장소는 id·locale·sources 불일치를 거부한다", async () => {
  for (const mismatched of [
    { ...profile, champion: { ...profile.champion, id: "Fiora" } },
    { ...profile, locale: "en_US" },
    { ...profile, sources: { ddragon: "16.17.1", cdragon: "16.17" } },
  ]) {
    const repo = new GameDataRepository({ async getJson() { return mismatched; } }, new VersionedCache("profile:mismatch"));
    await assert.rejects(repo.getChampionProfile(metadata, "ko_KR", "Aatrox"), /mismatch/);
  }
});

test("저장소는 실패한 요청을 다시 시도한다", async () => {
  let attempt = 0;
  const retrying = new GameDataRepository({ async getJson() {
    if (++attempt === 1) throw new Error("offline");
    return profile;
  } }, new VersionedCache("profile:retry"));
  await assert.rejects(retrying.getChampionProfile(metadata, "ko_KR", "Aatrox"), /offline/);
  assert.equal((await retrying.getChampionProfile(metadata, "ko_KR", "Aatrox")).champion.id, "Aatrox");
});

test("손상되거나 다른 챔피언인 메모리 캐시는 버리고 다시 받는다", async () => {
  for (const invalid of [
    null,
    { ...profile, champion: { ...profile.champion, id: "Fiora" } },
  ]) {
    const cache = new VersionedCache("profile:invalid");
    const key = "profile:skins-v1:26.18:16.18.1:16.18:ko_KR:Aatrox";
    cache.set(key, invalid);
    let requests = 0;
    const repository = new GameDataRepository({ async getJson() {
      requests += 1;
      return profile;
    } }, cache);
    assert.equal(await repository.getChampionProfile(metadata, "ko_KR", "Aatrox"), profile);
    assert.equal(await repository.getChampionProfile(metadata, "ko_KR", "Aatrox"), profile);
    assert.equal(requests, 1);
  }
});

test("기본 + 성장 스탯 필드", () => {
  const fields = getStatFields("ko_KR");
  assert.equal(fields.length, 11);
  assert.ok(fields.every((field) => !field.key.endsWith("perlevel")));
  assert.equal(fields.find((field) => field.key === "hp")?.growthKey, "hpperlevel");
  const speed = fields.find((field) => field.key === "attackspeed")!;
  assert.equal(speed.format(0.651), "0.651");
  assert.equal(speed.growthFormat?.(2.5), "2.5%");
  assert.equal(speed.growthFormat?.(0), "0%");
});
