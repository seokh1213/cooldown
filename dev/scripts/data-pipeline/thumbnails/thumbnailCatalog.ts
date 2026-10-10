import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { FORMULA_GROUPS } from "../../../../src/domain/game/formulas";
import { STAT_DEFINITIONS } from "../../../../src/domain/game/types/combatStats";
import { EXTRA_STAT_GLYPHS } from "../../../../src/domain/game/tooltip/formatting/statIcons";
import { RUNE_TREE_META } from "../../../../src/infrastructure/mappers/runeMapper";
import { ABILITY_SLOTS, formIconKey } from "./thumbnailArtifacts";
import { ABILITY_ICON_STATES } from "../../../../src/domain/game/abilities/abilityIconStates";
import { ABILITY_SIZE, CHAMPION_SIZE, ITEM_SIZE, RUNE_SIZE, STAT_ICON_SIZE, SUMMONER_SIZE, type Job } from "./thumbnailImages";

// Stat shards use an absolute asset prefix; runeIconKey must strip the same prefix.
export const runeKey = (iconPath: string) =>
  iconPath.replace(/^\/lol-game-data\/assets\/v1\//, "").replace(/^\//, "").replace(/\.png$/, "");

async function loadChampionIcons(championDir: string, championIds: string[]) {
  const abilityIcons = new Set<string>();
  const passiveIcons = new Set<string>();
  /*
   * 스탯 글리프.
   *
   * 화면이 마지막까지 CommunityDragon 을 직접 보던 것이다. 툴팁의 "60% 공격력" 앞에
   * 붙는 검 모양이고, 이제 아이템 능력치 줄도 같은 것을 쓴다. 이름이 나오는 자리는
   * 셋이라 셋을 다 모은다 — 챔피언 자료에 박힌 자리 표시, 계산식 표, 스탯 정의.
   */
  const statIcons = new Set<string>();
  for (const group of FORMULA_GROUPS) for (const entry of group.entries) if (entry.icon) statIcons.add(entry.icon);
  for (const definition of Object.values(STAT_DEFINITIONS)) if (definition.icon) statIcons.add(definition.icon);
  for (const icon of Object.values(EXTRA_STAT_GLYPHS)) statIcons.add(icon);

  /** 챔피언 → P·Q·W·E·R 차례의 아이콘 파일 이름. 띠의 칸 차례가 곧 이 차례다. */
  const abilityStrips = new Map<string, Array<string | undefined>>();
  /*
   * 변신 스킬 아이콘 스물일곱 장(엘리스·니달리·제이스·그웬).
   *
   * 여기만 마지막까지 Community Dragon 을 화면에서 직접 보고 있었다. 우리 자리로
   * 옮겨야 서비스워커가 맡고 판본이 바뀌어도 주소가 어긋나지 않는다.
   */
  const formIcons = new Map<string, { iconVersion: string; iconPath: string }>();
  for (const id of championIds) {
    const champion = (JSON.parse(await readFile(path.join(championDir, `${id}.json`), "utf8")) as {
      champion?: {
        abilities?: Record<string, { id?: string; iconFile?: string; forms?: Array<{ iconVersion: string; iconPath: string }> }>;
      };
    }).champion;
    for (const [slot, ability] of Object.entries(champion?.abilities ?? {})) {
      if (slot === "P") {
        if (ability?.iconFile) passiveIcons.add(ability.iconFile.replace(/\.png$/, ""));
      } else if (ability?.id) {
        abilityIcons.add(ability.id);
      }
    }
    for (const token of JSON.stringify(champion ?? {}).matchAll(/\[\[si:([a-z]+)]]/g)) statIcons.add(token[1]);
    for (const ability of Object.values(champion?.abilities ?? {})) {
      for (const form of ability?.forms ?? []) {
        if (form.iconVersion && form.iconPath) formIcons.set(formIconKey(form.iconPath), form);
      }
    }
    abilityStrips.set(
      id,
      ABILITY_SLOTS.map((slot) => {
        const ability = champion?.abilities?.[slot];
        if (!ability) return undefined;
        return slot === "P" ? ability.iconFile?.replace(/\.png$/, "") : ability.id;
      }),
    );
  }

  return { abilityIcons, passiveIcons, statIcons, abilityStrips, formIcons };
}

export async function loadThumbnailCatalog(directory: string, patchVersion: string, cdragonVersion: string) {
  const championDir = path.join(directory, patchVersion, "champions", "ko_KR");
  // `index.json` 은 목록 파일이지 챔피언이 아니다. 이것까지 받으러 가면 403 이 난다.
  const championIds = (await readdir(championDir))
    .filter((f) => f.endsWith(".json") && f !== "index.json")
    .map((f) => f.replace(/\.json$/, ""));

  const itemsFile = path.join(directory, patchVersion, "items-normalized-ko_KR.json");
  const items = (JSON.parse(await readFile(itemsFile, "utf8")) as { items: Array<{ id: string }> }).items;

  /*
   * 룬 아이콘 경로는 자료 안에 `perk-images/Styles/.../X.png` 꼴로 박혀 있다.
   * 로케일마다 같은 그림이라 하나만 읽어 모으고, 폴더 구조를 그대로 옮긴다.
   * 화면이 `runeIconUrl(iconPath)` 로 부르므로 경로가 어긋나면 안 된다.
   */
  const runesFile = path.join(directory, patchVersion, "runes-normalized-ko_KR.json");
  const runePaths = [...new Set([
    ...new Set([...(await readFile(runesFile, "utf8")).matchAll(/"iconPath"\s*:\s*"([^"]+)"/g)].map((match) => match[1])),
  ]
    .concat(Object.values(RUNE_TREE_META).map((tree) => tree.icon))
    .filter((iconPath) => iconPath.endsWith(".png")))]
    /*
     * 이름 차례로 세운다.
     *
     * 시트 칸 자리를 화면이 스스로 계산하려면 양쪽이 같은 차례를 써야 한다.
     * 자료에 실린 차례는 룬과 파편이 서로 다른 자리에서 오므로 화면이 그대로
     * 되살리기 어렵다. 이름으로 세우면 어느 쪽에서 세든 같다.
     */
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  /*
   * 소환사 주문 아이콘.
   *
   * 백과 네 탭 중 이것만 아직 Data Dragon 을 직접 보고 있었다. 서른네 장이라
   * 시트로 붙이면 한 건이 된다. 파일 이름이 그대로 열쇠다("SummonerBarrier.png").
   */
  const summonerFile = path.join(directory, patchVersion, "summoner-normalized-ko_KR.json");
  const summonerIcons = [
    ...new Set(
      (JSON.parse(await readFile(summonerFile, "utf8")) as { spells: Array<{ iconPath?: string }> }).spells
        .map((spell) => (spell.iconPath ?? "").replace(/\.png$/, ""))
        .filter(Boolean),
    ),
  ].sort();

  const icons = await loadChampionIcons(championDir, championIds);
  for (const [key, state] of Object.entries(ABILITY_ICON_STATES)) {
    if (state.thumbnailName) {
      const [champion, slot] = key.split(":");
      const strip = icons.abilityStrips.get(champion);
      const column = ABILITY_SLOTS.indexOf(slot as typeof ABILITY_SLOTS[number]);
      if (strip && column >= 0) strip[column] = state.thumbnailName;
    }
    for (const variant of state.variants ?? []) {
      icons.formIcons.set(formIconKey(variant.iconPath), {
        iconVersion: cdragonVersion, iconPath: variant.iconPath,
      });
    }
  }
  return { championIds, items, runePaths, summonerIcons, cdragonVersion, ...icons };
}

export type ThumbnailCatalog = Awaited<ReturnType<typeof loadThumbnailCatalog>>;

export async function createThumbnailJobs(catalog: ThumbnailCatalog, out: string, ddragon: string): Promise<Job[]> {
  const { championIds, items, runePaths, summonerIcons, abilityIcons, passiveIcons, statIcons, formIcons } = catalog;
  const runeOut = path.join(out, "runes");
  const statOut = path.join(out, "stat");
  await mkdir(statOut, { recursive: true });
  await mkdir(path.join(out, "ability"), { recursive: true });
  await mkdir(path.join(out, "form"), { recursive: true });
  await mkdir(path.join(out, "champion"), { recursive: true });
  await mkdir(path.join(out, "summoner"), { recursive: true });
  await mkdir(path.join(out, "spell"), { recursive: true });
  await mkdir(path.join(out, "passive"), { recursive: true });
  await mkdir(path.join(out, "item"), { recursive: true });

  const jobs: Job[] = [
    ...championIds.map((id) => ({
      url: `https://ddragon.leagueoflegends.com/cdn/${ddragon}/img/champion/${id}.png`,
      file: path.join(out, "champion", `${id}.webp`),
      size: CHAMPION_SIZE,
    })),
    ...items.map((item) => ({
      url: `https://ddragon.leagueoflegends.com/cdn/${ddragon}/img/item/${item.id}.png`,
      file: path.join(out, "item", `${item.id}.webp`),
      size: ITEM_SIZE,
    })),
    ...[...abilityIcons].map((name) => ({
      url: `https://ddragon.leagueoflegends.com/cdn/${ddragon}/img/spell/${name}.png`,
      file: path.join(out, "spell", `${name}.webp`),
      size: ABILITY_SIZE,
    })),
    ...[...passiveIcons].map((name) => ({
      url: `https://ddragon.leagueoflegends.com/cdn/${ddragon}/img/passive/${name}.png`,
      file: path.join(out, "passive", `${name}.webp`),
      size: ABILITY_SIZE,
    })),
    ...summonerIcons.map((name) => ({
      url: `https://ddragon.leagueoflegends.com/cdn/${ddragon}/img/spell/${name}.png`,
      file: path.join(out, "summoner", `${name}.webp`),
      size: SUMMONER_SIZE,
    })),
    ...[...statIcons].sort().map((name) => ({
      url: `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/assets/ux/fonts/texticons/lol/statsicon/${name}.png`,
      file: path.join(statOut, `${name}.webp`),
      size: STAT_ICON_SIZE,
    })),
    ...[...formIcons].map(([key, form]) => ({
      url: `https://raw.communitydragon.org/${form.iconVersion}/game/${form.iconPath}`,
      file: path.join(out, "form", `${key}.webp`),
      size: ABILITY_SIZE,
    })),
    ...runePaths.map((iconPath) => ({
      url: `https://ddragon.leagueoflegends.com/cdn/img/${runeKey(iconPath)}.png`,
      file: path.join(runeOut, `${runeKey(iconPath)}.webp`),
      size: RUNE_SIZE,
    })),
  ];
  for (const state of Object.values(ABILITY_ICON_STATES)) {
    if (!state.defaultIconPath || !state.thumbnailName) continue;
    jobs.push({
      url: `https://raw.communitydragon.org/${catalog.cdragonVersion}/game/${state.defaultIconPath}`,
      file: path.join(out, "spell", `${state.thumbnailName}.webp`), size: ABILITY_SIZE,
    });
  }
  // 룬은 폴더가 깊다. 미리 만들어 두지 않으면 쓰기가 실패한다.
  for (const iconPath of runePaths) {
    await mkdir(path.dirname(path.join(runeOut, runeKey(iconPath))), { recursive: true });
  }

  return jobs;
}
