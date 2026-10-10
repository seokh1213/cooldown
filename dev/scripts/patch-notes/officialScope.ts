import type { PatchEntityKind } from "../../../src/domain/game/contracts/patchNotes";

export interface OfficialSectionCoverage {
  title: string;
  id?: string;
  scope: "balance" | "mode" | "announcement" | "unknown";
  rows: number;
}

export interface OfficialScope extends Omit<OfficialSectionCoverage, "rows"> {
  kind?: PatchEntityKind;
  rootEntity?: string;
  groupSections?: boolean;
}
export type OfficialChampions = Record<string, string[]>;

const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");
const systemSections = new Set([
  "systems", "game-systems", "runes", "summoner-spells", "role-quests", "role-quest-adjustments",
  "support-adjustments", "atakhan", "atakhan-blood-roses-and-feats", "epic-objective-tuning",
  "jungle-adjustments", "faelights-and-vision-changes", "faelights-and-vision", "homeguard", "homeguards",
  "crystalline-overgrowth", "game-start-time", "turrets", "minions", "lane-minions", "champion-bounties",
  "bounties", "omnivamp", "teleport", "thornbound-atakhan", "void-epic-monsters", "dragon", "baron-nashor",
  "feats-of-strength", "feets-of-strength", "respawning-nexus-turrets", "lane-swaps", "turret-plates",
  "support-control-wards",
]);
const basicChampions = /^(?:Champions|챔피언|英雄)$/i;
const basicItems = /^(?:Items|아이템|道具|装备)$/i;
const basicSystems = /^(?:Systems|Game Systems|Runes|Summoner Spells|게임 체계|체계|시스템|룬|소환사 주문|系統|系统|符文|召喚師技能)$/i;
const mode = /(?:^|\b)(?:ARAM|ARURF|URF|Arena|Swiftplay|Brawl|Doom Bots|Classic)(?:\b|$)|무작위 총력전|신속 대전|아레나|모두 무작위|隨機單中|隨機阿福|超速衝點|競技場/i;
const announcements = /(?:mid.?patch|patch.highlights|ranked|matchmaking|clash|skins?|chromas?|shop|sanctum|battle.pass|season.\d|season.\d.is.here|essence|account.xp|honor|parental|behavior|disruptive|reporting|discord|leaderboard|keybind|autofill|champion.select|champ.select|practice.tool|spectator|streamer|pinged.abilities|pinging|last.hit.indicators|voice|vo.updates|compatibility|opengl|directx|riot.games.community|april.fool|arcane.anniversary|hall.of.legends|black.rose.beats|demacia.rising|demon(?:.s)?.hand|^demon$|koeshin|^world$|world.s.patch|worlds.winners|world.s.winners|t1.world|icon.rarity|thoughts.on|faqs|hextech.chests|kill.and.takedown.sfx|game.info.tracking|custom.game|position.binding|wasd|fearless.draft|riot.summer.break|new.game.mode|new.player.experience|upcoming.battle|pride|act.\d|lobby.hostage|banning.allied|bug.?fix|quality.of.life|qol)/i;

export function officialScope(options: {
  title: string; id?: string; previous?: OfficialScope; champions?: OfficialChampions;
}): OfficialScope {
  const { title, id, previous } = options;
  const key = (id?.replace(/^patch-/i, "") ?? title.toLowerCase().replace(/\s+/g, "-")).toLowerCase();
  const base = { title, id };
  if (announcements.test(key) || announcements.test(title) ||
    /버그 수정|패치 하이라이트|추가 패치|관련 글|상점|마법공학 상자|변경 사항 FAQ|격전|錯誤修正|愚人節|蒂瑪西亞崛起|積分賽季|尾兵指示器/.test(title)) {
    return { ...base, scope: "announcement" };
  }
  if (mode.test(title) || mode.test(key.replaceAll("-", " "))) return { ...base, scope: "mode" };
  if (previous?.scope === "mode") return { ...base, scope: "mode" };
  if (basicChampions.test(title) || key === "champions") return { ...base, scope: "balance", kind: "champion" };
  if (basicItems.test(title) || ["items", "new-items", "returning-items", "updated-items", "tier-3-boot-upgrades"].includes(key)) {
    return { ...base, scope: "balance", kind: "item" };
  }
  if (basicSystems.test(title) || systemSections.has(key) || title === "공격로 교체") {
    return { ...base, scope: "balance", kind: "system", groupSections:
      !basicSystems.test(title) && !["systems", "game-systems", "runes", "summoner-spells"].includes(key) };
  }
  const champion = Object.entries(options.champions ?? {}).find(([candidate, names]) =>
    normalized(candidate) === normalized(key.replace(/-update$/, "")) || names.some(name =>
      title === name || key.startsWith(`${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-`)));
  if (champion) return { ...base, scope: "balance", kind: "champion", rootEntity: champion[0] };
  return { ...base, scope: "unknown" };
}
