/**
 * 결정이 필요한 자리를 한 장짜리 HTML 로 뽑는다 (일회성, 커밋하지 않는다)
 *
 * 남은 구멍은 기계가 못 가리는 것들이다. 스킬 하나만 떼어 놓고 물으면 답할 수
 * 없으므로, 왼쪽에 챔피언의 P 부터 R 까지를 통째로 펼치고 오른쪽에 그 챔피언에
 * 대한 물음을 붙인다.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import type { ChampionCard } from "../scripts/llm/lib/facts";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "../scripts/llm/lib/data";
import { loadSpellOverrides } from "../scripts/llm/lib/spellOverrides";

const llmDir = path.join(PUBLIC_DATA_ROOT, resolvePatchVersion(), "llm");
const cards = (JSON.parse(fs.readFileSync(path.join(llmDir, "champion-cards-ko_KR.json"), "utf8")) as { cards: ChampionCard[] }).cards;

const TAGS = [
  "둔화", "기절", "속박", "에어본", "강제 이동(넉백/끌기)", "침묵", "공포", "매혹", "도발", "억제",
  "광역", "이동기", "돌진", "은신", "분신",
  "회복", "보호막", "치유 감소", "피해 면역", "공격 무효화", "투사체 차단", "강인함",
  "기본 공격 강화", "공격 속도 증가", "이동 속도 증가", "쿨타임 초기화",
  "최대 체력 비례 피해", "잃은 체력 비례", "고정 피해", "처형", "관통",
  "적 방어력 감소", "적 마법 저항력 감소", "자기 방어력 증가", "자기 마법 저항력 증가",
];

/**
 * 아직 어휘로 세우지 않은 후보. 고르면 "이 개념이 필요하다" 는 뜻이다.
 *
 * `연계 강화` 는 애니비아 E 처럼 **다른 스킬이 먼저 맞아야 세지는** 것이다.
 * "Q 를 피하면 E 가 절반" 이라는 말은 상성 판단에 바로 쓰인다.
 */
const PROPOSED = ["연계 강화", "스킬 강화", "사거리 증가", "최소 체력 보장"];

interface Gap {
  slot: string;
  name: string;
  kind: "효과 태그" | "피해 유형";
  text: string;
}

const sheet: Array<{ id: string; name: string; title?: string; subclass?: string; spells: ChampionCard["spells"]; gaps: Gap[] }> = [];

// 이미 사람이 보고 확인해 준 자리는 다시 묻지 않는다.
const overrides = loadSpellOverrides();

for (const card of cards) {
  const gaps: Gap[] = [];
  for (const spell of card.spells) {
    const seen = overrides[`${card.id}:${spell.slot}`];
    if (spell.effects.length === 0 && !seen?.confirmedEmpty) {
      gaps.push({ slot: spell.slot, name: spell.name, kind: "효과 태그", text: spell.text });
    }
    if (spell.damageTypes.length === 0 && !seen?.confirmedNoDamage && /피해를 입힙|피해를 입히/.test(spell.text)) {
      gaps.push({ slot: spell.slot, name: spell.name, kind: "피해 유형", text: spell.text });
    }
  }
  if (gaps.length === 0) continue;
  sheet.push({
    id: card.id,
    name: card.name,
    title: card.title,
    subclass: card.wiki?.subclass,
    spells: card.spells,
    gaps,
  });
}

const data = { sheet, tags: TAGS, proposed: PROPOSED, patch: resolvePatchVersion() };
const dest = process.argv[2];
fs.writeFileSync(dest, JSON.stringify(data), "utf8");
console.log(`챔피언 ${sheet.length}종 · 물음 ${sheet.reduce((n, c) => n + c.gaps.length, 0)}개 → ${dest}`);
