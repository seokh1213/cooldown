/**
 * 챔피언 찾기 평가 — 질문에 나온 챔피언을 빠짐없이, 엉뚱한 것 없이 찾는가
 *
 * 갈래 판정기가 아무리 좋아도 챔피언을 못 찾으면 상성 카드를 지을 수 없다. 큰 정답 세트에서
 * 판정 오답을 뜯어보니 狗熊(볼리베어)·蛤蟆(타 켄치)·"아트" 같은 별명에서 이름 찾기부터 틀렸다.
 *
 * 문항: Codex 가 짓고 Claude 가 따로 가린 갈래 판정 세트(문항마다 정답 챔피언 id).
 * 앱과 같게 화면 언어 = 문항 언어의 카드와 세 언어 이름 색인(champion-names.json)으로 찾는다.
 *
 *   정확    찾은 챔피언 집합이 정답과 같다
 *   놓침    정답에 있는데 못 찾은 챔피언 수
 *   헛잡음  정답에 없는데 찾은 챔피언 수
 *
 * 사용: npx tsx scripts/llm/eval-champion-detect.ts <cases.json> [--names <champion-names.json>] [--show]
 */
import * as fs from "fs";
import * as path from "path";
import type { ChampionCard } from "./lib/facts";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";
import type { AdvisorData } from "../../src/lib/advisor/context";
import { detectChampions } from "../../src/lib/advisor/intent";

type Lang = "ko_KR" | "en_US" | "zh_CN";
interface Case {
  lang: Lang;
  question: string;
  champions: string[];
}

const arg = (name: string): string | undefined => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const file = process.argv[2];
const dir = path.join(PUBLIC_DATA_ROOT, resolvePatchVersion(), "llm");
const namesFile = arg("names") ?? path.join(dir, "champion-names.json");
const names = (JSON.parse(fs.readFileSync(namesFile, "utf8")) as { names: Record<string, string[]> }).names;

const dataFor = new Map<Lang, AdvisorData>();
for (const lang of ["ko_KR", "en_US", "zh_CN"] as Lang[]) {
  const cards = (JSON.parse(fs.readFileSync(path.join(dir, `champion-cards-${lang}.json`), "utf8")) as { cards: ChampionCard[] }).cards;
  // context.ts 의 loadAdvisorData 와 같은 꼴
  dataFor.set(lang, {
    cards,
    cardById: new Map(cards.map((c) => [c.id, c])),
    aliases: new Map(cards.map((c) => [c.id, [...new Set([...(names[c.id] ?? []), c.id])].filter((n) => n !== c.name)])),
  } as unknown as AdvisorData);
}

const cases = (JSON.parse(fs.readFileSync(file, "utf8")) as { cases: Case[] }).cases;
const stats = new Map<string, { n: number; exact: number; missed: number; spurious: number }>();
const bump = (key: string, exact: boolean, missed: number, spurious: number) => {
  const s = stats.get(key) ?? { n: 0, exact: 0, missed: 0, spurious: 0 };
  s.n += 1;
  s.exact += exact ? 1 : 0;
  s.missed += missed;
  s.spurious += spurious;
  stats.set(key, s);
};
for (const c of cases) {
  const found = detectChampions(dataFor.get(c.lang)!, c.question).map((card) => card.id);
  const gold = new Set(c.champions);
  const got = new Set(found);
  const missed = [...gold].filter((id) => !got.has(id));
  const spurious = [...got].filter((id) => !gold.has(id));
  const exact = missed.length === 0 && spurious.length === 0;
  bump(c.lang, exact, missed.length, spurious.length);
  bump("전체", exact, missed.length, spurious.length);
  if (!exact && process.argv.includes("--show")) {
    console.log(`  ✗ [${c.lang}] ${c.question}  놓침 ${missed.join(",") || "-"} · 헛잡음 ${spurious.join(",") || "-"}`);
  }
}
console.log(`\n${path.basename(file)} · 이름 색인 ${path.basename(namesFile)}`);
for (const [key, s] of stats) {
  console.log(`${key.padEnd(6)} 정확 ${s.exact}/${s.n} (${Math.round((s.exact / s.n) * 100)}%) · 놓침 ${s.missed} · 헛잡음 ${s.spurious}`);
}
