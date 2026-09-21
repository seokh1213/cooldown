/**
 * 도출 노트 검사
 *
 * `generated` 표시가 붙은 항목은 본문을 카드에서 지어 낸다. 지어 낸 문장이 카드와
 * 어긋나면 그대로 배포되므로, **문장이 짚은 슬롯과 효과가 실제로 카드에 있는지**를
 * 여기서 되짚는다. 산문 노트로는 못 하던 일이고, 자료를 주장으로 바꾼 이유이기도 하다.
 *
 * 사람이 적는 `nuance` 는 도출할 수 없는 판단이라 사실 대조가 불가능하다. 대신
 * 지킬 수 있는 것만 지킨다 — 한 문장, 합니다체, 아이템 이름과 수치 없음.
 */
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ChampionCard } from "./llm/lib/facts";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./llm/lib/data";
import { loadPlaybooks } from "./llm/lib/playbook";
import {
  deriveEscapeClaims,
  deriveItemClaims,
  renderEscapeClaims,
  renderItemClaims,
} from "./llm/lib/claims";

const llmDir = path.join(PUBLIC_DATA_ROOT, resolvePatchVersion(), "llm");
const cards = (
  JSON.parse(fs.readFileSync(path.join(llmDir, "champion-cards-ko_KR.json"), "utf8")) as { cards: ChampionCard[] }
).cards;
const byId = new Map(cards.map((c) => [c.id, c]));

const playbooks = loadPlaybooks();

/** 판올림마다 바뀌는 이름. 노트에 박으면 틀린 채로 남는다. */
const ITEM_WORDS = /처형인|모렐로|가시 갑옷|밴시|존야|판금 장화|얼어붙은 심장|워모그|스테락|루덴|무한의 대검|정령의 형상|태양불꽃|대자연의 힘|서리 여왕/;

/** 받침 뒤에 와야 하는 조사와 그 짝 */
const PAIRS: Array<[withFinal: string, withoutFinal: string]> = [
  ["이", "가"],
  ["은", "는"],
  ["을", "를"],
  ["과", "와"],
];

/**
 * 스킬 이름 바로 뒤의 조사만 본다.
 *
 * 문장 전체를 훑으면 "깎는", "있는" 같은 동사 어미까지 조사로 잡힌다. 실제로
 * 어긋날 수 있는 자리는 **챔피언마다 달라지는 것 뒤**, 곧 스킬 이름 뒤뿐이다.
 */
function badParticle(text: string, names: string[]): string | undefined {
  for (const name of names) {
    if (!name) continue;
    let at = text.indexOf(name);
    while (at >= 0) {
      const after = text.slice(at + name.length, at + name.length + 1);
      const pair = PAIRS.find(([a, b]) => a === after || b === after);
      if (pair) {
        const code = name.charCodeAt(name.length - 1) - 0xac00;
        const want = code >= 0 && code <= 11171 && code % 28 !== 0 ? pair[0] : pair[1];
        if (after !== want) return `${name}${after} → ${name}${want}`;
      }
      at = text.indexOf(name, at + 1);
    }
  }
  return undefined;
}

let generated = 0;
let withNuance = 0;

/**
 * 사람이 적은 한 문장을 본다.
 *
 * 내용의 참·거짓은 기계가 못 가린다. 도출할 수 없는 판단이라 적는 것이므로 당연하다.
 * 대신 지킬 수 있는 것만 지킨다 — 한 문장, 합니다체, 아이템 이름과 수치 없음.
 */
function checkNuance(nuance: string, card: ChampionCard, where: string): void {
  if (!nuance) return;
  withNuance += 1;
  assert.ok(nuance.endsWith("다."), `${where}: nuance 는 합니다체로 끝나야 합니다`);
  const bare = card.spells.reduce((acc, s) => acc.split(s.name).join(" "), nuance);
  assert.ok(!/\d/.test(bare), `${where}: nuance 에 수치가 있습니다`);
  assert.ok(!ITEM_WORDS.test(nuance), `${where}: nuance 에 아이템 이름이 있습니다`);
  const sentences = nuance.split(/(?<=다\.)\s+/).filter(Boolean);
  assert.equal(sentences.length, 1, `${where}: nuance 는 한 문장이어야 합니다 (${sentences.length}문장)`);
  assert.ok(nuance.length <= 200, `${where}: nuance 가 너무 깁니다 (${nuance.length}자)`);
}

for (const [champion, book] of playbooks) {
  for (const entry of [...book.playing, ...book.against]) {
    if (!entry.generated) continue;
    generated += 1;
    const where = `${champion} ${entry.id ?? entry.category}`;

    // 본문은 빌드가 채운다. 손으로 적어 두면 어느 쪽이 참인지 알 수 없다.
    assert.equal(entry.text, "", `${where}: generated 항목의 text 는 비어 있어야 합니다`);

    const card = byId.get(champion);
    assert.ok(card, `${where}: 카드를 찾을 수 없습니다`);

    if (entry.generated === "escape-window") {
      const escape = deriveEscapeClaims(card);
      const slots = new Set(card.spells.map((s) => s.slot));
      for (const move of escape.moves) {
        assert.ok(slots.has(move.slot as never), `${where}: 없는 슬롯 ${move.slot} 을 짚었습니다`);
        const spell = card.spells.find((s) => s.slot === move.slot);
        assert.ok(
          spell?.effects.includes("이동기") || spell?.effects.includes("돌진"),
          `${where}: ${move.slot} 은 이동 수단이 아닙니다`,
        );
        // 쿨타임은 수치를 그대로 싣는다. 판올림마다 다시 만들어지므로 낡지 않는다.
        assert.ok(move.cooldown > 0, `${where}: ${move.slot} 쿨타임이 비어 있습니다`);
      }
      const madeEscape = renderEscapeClaims(card, escape);
      assert.ok(madeEscape.length >= 40, `${where}: 생성된 본문이 너무 짧습니다`);
      // 슬롯 문자 뒤 조사는 읽는 소리로 고른다. "E 을" 이 나오면 안 된다.
      assert.ok(!/[PQWE]을\s|R를\s/.test(madeEscape), `${where}: 슬롯 뒤 조사가 어긋났습니다`);
      assert.ok(!madeEscape.includes("|"), `${where}: 스킬 이름에 구분자가 남았습니다`);
      checkNuance(entry.nuance ?? "", card, where);
      continue;
    }

    const claims = deriveItemClaims(card);
    const slots = new Set(card.spells.map((s) => s.slot));

    // 주장이 짚은 슬롯은 전부 실재해야 한다.
    for (const list of [
      ...Object.values(claims.profile.byType),
      claims.profile.exceptions,
      claims.sustain,
      claims.cc,
      ...claims.discounts.map((d) => d.slots),
    ]) {
      for (const slot of list ?? []) {
        assert.ok(slots.has(slot as never), `${where}: 없는 슬롯 ${slot} 을 짚었습니다`);
      }
    }

    // 예외로 짚은 슬롯은 주된 유형과 달라야 한다. 같으면 "다만 …만" 이 거짓말이 된다.
    for (const slot of claims.profile.exceptions) {
      const spell = card.spells.find((s) => s.slot === slot);
      assert.ok(
        spell && !spell.damageTypes.includes(claims.profile.mix as never),
        `${where}: ${slot} 은 예외가 아닙니다`,
      );
    }

    // 회복·군중 제어로 짚은 슬롯은 실제로 그 태그를 가져야 한다.
    for (const slot of claims.sustain) {
      const spell = card.spells.find((s) => s.slot === slot);
      assert.ok(spell?.effects.includes("회복"), `${where}: ${slot} 에 회복 태그가 없습니다`);
    }

    const rendered = renderItemClaims(card, claims);
    assert.ok(rendered.length >= 40, `${where}: 생성된 본문이 너무 짧습니다 (${rendered.length}자)`);
    // 스킬 이름에는 숫자가 들어간다("E 90구경 투망"). 막으려는 것은 판올림마다
    // 바뀌는 수치이므로 이름을 지우고 본다.
    const bare = [card.name, ...card.spells.map((s) => s.name)].reduce(
      (acc, name) => acc.split(name).join(" "),
      rendered,
    );
    assert.ok(!/\d/.test(bare), `${where}: 생성된 본문에 수치가 있습니다`);
    assert.ok(!ITEM_WORDS.test(rendered), `${where}: 생성된 본문에 아이템 이름이 있습니다`);
    // 조사가 어긋나면 "장송곡가", "물리이라" 처럼 읽힌다. 스킬 이름이 문장에 그대로
    // 들어가므로 이름 하나만 바뀌어도 어긋난다. 받침을 보고 되짚는다.
    const wrong = badParticle(rendered, card.spells.map((s) => s.name));
    assert.equal(wrong, undefined, `${where}: 조사가 어긋났습니다 — "${wrong}"`);

    checkNuance(entry.nuance ?? "", card, where);
  }
}

assert.ok(generated >= 340, `도출 항목이 ${generated}건뿐입니다`);
console.log(`✅ 도출 노트 통과 (생성 ${generated}건, 그중 nuance ${withNuance}건)`);
