/**
 * 효과 태그 검수 — 태그를 붙인 문장을 보여 주고 수상한 것을 짚는다
 *
 * 노트 고리(hooks)는 카드의 효과 태그로 "잭스라면 E 반격이 여기에 해당합니다" 를 짓는다. 태그가
 * 틀리면 틀린 스킬을 부른다. 그레이브즈 W 연막탄이 "시야가 차단" 의 차단 때문에 투사체 차단으로
 * 잡혀 있었다. 고리가 쓰는 태그만 본다: 묶는 효과, 투사체 차단, 공격 무효화, 피해 면역.
 *
 * 수상한 것:
 *   근거 문장이 면역·해제·조건("걸린 적에게", "기절에 면역")뿐 — 이 스킬이 거는 것이 아니다
 *   근거 문장을 못 찾음 — 보정(spell-effects.json)이나 다른 판정에서 왔다
 *
 * 사용: npx tsx scripts/llm/audit-effect-tags.ts [--all]
 */
import * as fs from "fs";
import * as path from "path";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";
import type { ChampionCard } from "./lib/facts";

const WORDS: Record<string, RegExp> = {
  기절: /기절/,
  속박: /속박/,
  에어본: /띄[우웁워운웠]|공중에 뜨|공중에 뜹/,
  "강제 이동(넉백/끌기)": /밀쳐|밀어[내냅냈]|끌어당|끌고 옵|잡아당|끌려가|끌어옵/,
  도발: /도발/,
  매혹: /매혹/,
  공포: /공포/,
  억제: /억제|제압/,
  "투사체 차단": /투사체를[^.]{0,6}(막|파괴|가로막)|막아냅|차단/,
  "공격 무효화": /받는 모든 공격[^.]{0,20}막|막아낸 다음|모든 공격과 이동 불가|회피하고|빗나가게/,
};
/** 이 스킬이 거는 것이 아니라 막거나 풀거나, 이미 걸린 대상을 조건으로 삼는 말 */
const NOT_APPLIED = /면역|무시|해제|정화|없애|제거|걸린|걸려 있는|상태인 |상태의|받지 않|당한 적|된 적|된 대상|하면 |시야/;

const patch = resolvePatchVersion();
const cards = (JSON.parse(fs.readFileSync(path.join(PUBLIC_DATA_ROOT, patch, "llm", "champion-cards-ko_KR.json"), "utf8")) as { cards: ChampionCard[] }).cards;
const showAll = process.argv.includes("--all");
let flagged = 0;
let total = 0;
for (const card of cards) {
  for (const spell of card.spells) {
    for (const tag of spell.effects) {
      const word = WORDS[tag];
      if (!word) continue;
      total += 1;
      const text = `${spell.summary ?? ""} ${spell.text ?? ""}`;
      const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => word.test(s));
      const applied = sentences.filter((s) => !NOT_APPLIED.test(s));
      const why = !sentences.length ? "근거 문장 없음(보정·다른 판정)" : !applied.length ? "근거가 면역·해제·조건 문장뿐" : "";
      if (why) flagged += 1;
      if (why || showAll) console.log(`${why ? "?" : " "} ${card.id}:${spell.slot} ${spell.name} [${tag}] ${why}\n    ${(sentences[0] ?? "").slice(0, 150)}`);
    }
  }
}
console.log(`\n태그 ${total}건 중 수상 ${flagged}건`);
