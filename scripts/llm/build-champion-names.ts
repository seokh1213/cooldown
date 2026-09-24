/**
 * 챔피언 이름 색인 — 세 언어 이름과 사람들이 실제로 부르는 이름을 한 곳에
 *
 * 도우미는 화면 언어의 카드만 받는다. 그런데 한국어 화면에서 "How do I play Yasuo into
 * Malphite?" 처럼 영어 이름으로 묻는 사람이 있다. 카드에는 "야스오" 만 있어 이름을 못
 * 찾았고, 질문이 자료 없이 검색으로 빠졌다. 카드 세 벌을 다 받으면 2.8MB 라, 이름만
 * 뽑아 둔다.
 *
 * 세 가지를 싣는다.
 *   카드 이름      세 언어 카드의 name
 *   중국어 음역    Riot 의 zh_CN 은 name 에 칭호(暗裔剑魔), title 에 음역 이름(亚托克斯)을 둔다.
 *                  한국어·영어와 뒤바뀌어 있어 카드에는 칭호만 들어갔다. 중국어 사용자는 布隆·
 *                  阿卡丽·瑞兹 처럼 음역 이름을 더 많이 쓴다. 374문항에서 중국어 이름 찾기가 19%였다.
 *   별명           knowledge/champion-aliases.json(狗头·龙龟·딩거·heca …). 사람이 검토하는 원본이다.
 *
 * 사용: npx tsx scripts/llm/build-champion-names.ts
 * 출력: public/data/<patch>/llm/champion-names.json  { id: [이름…] }
 */
import * as fs from "fs";
import * as path from "path";
import type { ChampionCard } from "./lib/facts";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";

const patch = resolvePatchVersion();
const dir = path.join(PUBLIC_DATA_ROOT, patch, "llm");
const names: Record<string, string[]> = {};
const add = (id: string, name: string | undefined) => {
  const list = (names[id] ??= []);
  if (name && !list.includes(name)) list.push(name);
};
for (const lang of ["ko_KR", "en_US", "zh_CN"]) {
  const cards = (JSON.parse(fs.readFileSync(path.join(dir, `champion-cards-${lang}.json`), "utf8")) as { cards: ChampionCard[] }).cards;
  for (const card of cards) add(card.id, card.name);
}

// 중국어 음역 이름. zh_CN 챔피언 파일의 title 이다.
const zhDir = path.join(PUBLIC_DATA_ROOT, patch, "champions", "zh_CN");
let transliterated = 0;
for (const id of Object.keys(names)) {
  const file = path.join(zhDir, `${id}.json`);
  if (!fs.existsSync(file)) continue;
  const title = (JSON.parse(fs.readFileSync(file, "utf8")) as { champion: { title?: string } }).champion.title;
  if (title && !names[id].includes(title)) {
    add(id, title);
    transliterated += 1;
  }
}

/*
 * 중국어 칭호의 앞·뒤 두 글자. 光辉女郎 → 光辉, 暗裔剑魔 → 剑魔, 疾风剑豪 → 剑豪.
 *
 * 중국 사용자는 칭호를 이렇게 줄여 부른다. 앱의 자동 접두사는 符文(룬)을 라이즈(符文法师)로,
 * 惩戒(강타)를 바루스(惩戒之箭)로 잡아 한자에서는 꺼 두었다. 헛잡음을 낸 것은 게임 용어와 겹치는
 * 것뿐이므로, 여기서는 아이템·룬·소환사 주문 이름 안에 들어가는 것과 두 챔피언이 나눠 가지는
 * 것을 빼고 싣는다.
 */
/*
 * 게임 글. 이름뿐 아니라 **설명 본문**까지 넣는다. 조각이 아이템 효과 이름 안에 들어 있어서
 * 之手(다리우스)가 帮助之手, 疾风(야스오)이 疾风骤雨, 不屈(판테온)이 不屈不挠 에서 잡혔다
 * (아이템 설명 5천 문장에서 헛잡음 142건).
 */
const vocabulary: string[] = [];
const strip = (html: string | undefined) => (html ?? "").replace(/<[^>]+>/g, " ");
for (const lang of ["ko_KR", "en_US", "zh_CN"]) {
  const load = <T>(file: string) => JSON.parse(fs.readFileSync(path.join(PUBLIC_DATA_ROOT, patch, file), "utf8")) as T;
  for (const i of load<{ items: Array<{ name: string; description?: string }> }>(`items-normalized-${lang}.json`).items) vocabulary.push(i.name, strip(i.description));
  for (const r of load<{ runes: Array<{ name: string; tooltip?: string }> }>(`runes-normalized-${lang}.json`).runes) vocabulary.push(r.name, strip(r.tooltip));
  for (const sp of load<{ spells: Array<{ name: string; tooltip?: string }> }>(`summoner-normalized-${lang}.json`).spells) vocabulary.push(sp.name, strip(sp.tooltip));
}
/**
 * 한자·한글 조각이 게임 글 안에 나오면 그 글을 말할 때 챔피언으로 잡힌다. 영문은 낱말 경계로
 * 찾으므로 보지 않는다. 게임 글에 챔피언 이름이 그대로 적힌 곳("피들스틱과 똑같아 보이는")은
 * 먼저 지운다 — 안 지우면 "피들" 이 제 이름 때문에 빠진다.
 */
let gameText: string[] | undefined;
const inGameText = (piece: string) => {
  if (/^[ -~]+$/.test(piece)) return false;
  gameText ??= (() => {
    const official = Object.values(names).flat().filter((n) => n.length >= 2).sort((a, b) => b.length - a.length);
    return vocabulary.map((text) => official.reduce((t, n) => t.split(n).join(" "), text));
  })();
  return gameText.some((text) => text.includes(piece));
};
const zhCards = (JSON.parse(fs.readFileSync(path.join(dir, "champion-cards-zh_CN.json"), "utf8")) as { cards: ChampionCard[] }).cards;
const pieceOwners = new Map<string, Set<string>>();
for (const card of zhCards) {
  if (card.name.length < 3) continue;
  for (const piece of [card.name.slice(0, 2), card.name.slice(-2)]) {
    pieceOwners.set(piece, new Set([...(pieceOwners.get(piece) ?? []), card.id]));
  }
}
const allNames = new Set(Object.values(names).flat());
let pieces = 0;
for (const [piece, owners] of pieceOwners) {
  if (owners.size !== 1 || allNames.has(piece)) continue;
  // 之·的 같은 허사가 든 조각(之手·之枪)은 이름 구실을 못 한다
  if (/[之的]/.test(piece) || inGameText(piece)) continue;
  add([...owners][0], piece);
  pieces += 1;
}

// 별명. 두 챔피언이 같은 별명을 가지면 어느 쪽인지 정할 수 없으니 둘 다 뺀다.
const aliasFile = path.resolve("knowledge/champion-aliases.json");
let aliasCount = 0;
if (fs.existsSync(aliasFile)) {
  const aliases = (JSON.parse(fs.readFileSync(aliasFile, "utf8")) as { aliases: Record<string, Record<string, string[]>> }).aliases;
  const owners = new Map<string, Set<string>>();
  for (const [id, byLang] of Object.entries(aliases)) {
    for (const alias of Object.values(byLang).flat()) {
      const key = alias.toLowerCase();
      owners.set(key, new Set([...(owners.get(key) ?? []), id]));
    }
  }
  // 다른 챔피언의 정식 이름과 같은 별명도 뺀다
  const official = new Map<string, string>();
  for (const [id, list] of Object.entries(names)) for (const n of list) official.set(n.toLowerCase(), id);
  for (const [id, byLang] of Object.entries(aliases)) {
    if (!names[id]) continue;
    for (const alias of Object.values(byLang).flat()) {
      const key = alias.toLowerCase();
      if ((owners.get(key)?.size ?? 0) > 1) continue;
      if (official.has(key) && official.get(key) !== id) continue;
      if (inGameText(alias)) continue;
      if (!names[id].some((n) => n.toLowerCase() === key)) {
        add(id, alias);
        aliasCount += 1;
      }
    }
  }
}

const out = path.join(dir, "champion-names.json");
fs.writeFileSync(out, JSON.stringify({ patch, names }), "utf8");
console.log(
  `생성: ${path.relative(process.cwd(), out)} (${Object.keys(names).length} 챔피언, 음역 ${transliterated}, 칭호 조각 ${pieces}, 별명 ${aliasCount}, ${(fs.statSync(out).size / 1024).toFixed(0)} KB)`,
);
