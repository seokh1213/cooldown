import fs from "node:fs";
import path from "node:path";
import type { SpellCrowdControl } from "../../../src/lib/knowledge/crowdControl";
import type { ChampionCard } from "../../../src/lib/knowledge/facts";
import { inferCrowdControl } from "../../../src/lib/knowledge/crowdControlInference";
import { digestSpellText } from "./spellOverrides";

interface ControlFile {
  patch: string;
  abilities: Record<string, SpellCrowdControl & { textDigest: string }>;
}
/** 원자료를 새로 읽을 때도 CC 보정을 적용한다. 패치가 다르면 확인되지 않은 도출값으로 표시한다. */
export function attachCrowdControl(cards: ChampionCard[], patch: string, koreanCards = cards): void {
  const file = path.resolve("knowledge", "crowd-control.json");
  const input: ControlFile | undefined = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : undefined;
  const korean = new Map(koreanCards.flatMap(card => card.spells.map(spell => [`${card.id}:${spell.slot}`, spell] as const)));
  for (const card of cards) {
    for (const spell of card.spells) {
      const known = input?.abilities[`${card.id}:${spell.slot}`];
      const source = korean.get(`${card.id}:${spell.slot}`) ?? spell;
      const current = input?.patch === patch && known?.textDigest === digestSpellText(source.text);
      // 영문·중문은 한국어 카드와 동일한 슬롯 메타데이터를 사용한다(본문 지문은 한국어에서 검사).
      spell.crowdControl = current && known ? { status: known.status, effects: known.effects } : inferCrowdControl(source.effects, source.text);
    }
  }
}
