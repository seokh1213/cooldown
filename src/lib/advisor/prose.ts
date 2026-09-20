/**
 * 코드가 쓰는 답문
 *
 * 카드만 만들고 대화에는 칩 하나만 남겨 두었다. 모델이 있을 때는 그 위에 해설이 붙으니
 * 말이 되는데, 모델이 없으면 대화가 이렇게 보인다.
 *
 *   사용자  오공 스킬 쿨타임
 *   도우미  [오공 · 스킬 · 재사용 대기시간 →]
 *
 * 물어본 사람 입장에서는 답을 못 받은 화면이다. 값은 옆 패널에 있지만 좁은 화면에서는
 * 그 패널조차 없다. 그래서 **답을 글로도 적는다.** 모델이 쓰는 것이 아니라 카드에 이미
 * 들어 있는 값을 문장으로 옮기는 것이라, 틀릴 자리가 없고 0초에 나온다.
 *
 * 카드와 겹치지 않느냐 — 겹친다. 다만 카드는 표이고 이것은 답이다. 표는 훑어보는
 * 것이고 답은 읽는 것이라 하는 일이 다르다. 카드 쪽은 대신 노트까지 얹어 더 준다.
 */
import type { Language } from "@/i18n";
import type { AdvisorAnswer } from "./answer";
import type { SpellFact } from "../../../scripts/llm/lib/facts";
import { cooldownFact, spellOneLiner } from "./answer";
import { translateTag } from "./promptLocale";

interface ProseWords {
  /** "{champion}의 {label}입니다." 처럼 값 하나를 알리는 말 */
  is: (subject: string, value: string) => string;
  /** 스킬 목록을 여는 말 */
  perSkill: (champion: string, label: string) => string;
  skillset: (champion: string) => string;
  effects: (subject: string, list: string) => string;
  none: (subject: string) => string;
  joiner: string;
  /**
   * 질문이 가리킨 사실의 이름.
   *
   * 없으면 `SpellFocus` 열거값(`cost`)이 그대로 문장에 샌다. 실제로 "오공의 스킬별
   * cost입니다" 가 나왔다. 쿨타임만 카드에서 이름을 꺼내 쓰고 나머지는 빈손이었다.
   */
  focus: Record<string, string>;
  /** 두 번째 문장의 주어. 앞 문장에서 이미 이름을 댔으므로 되풀이하지 않는다. */
  it: string;
}

const WORDS: Record<Language, ProseWords> = {
  ko_KR: {
    is: (subject, value) => `${subject}은 ${value}입니다.`,
    perSkill: (champion, label) => `${champion}의 스킬별 ${label}입니다.`,
    skillset: (champion) => `${champion}의 스킬 구성입니다.`,
    effects: (subject, list) => `${subject}의 효과는 ${list}입니다.`,
    none: (subject) => `${subject}은 자료에 없습니다.`,
    joiner: ", ",
    focus: { cooldown: "재사용 대기시간", cost: "소모값", ratio: "계수", damage: "피해량", effect: "효과" },
    it: "이 스킬",
  },
  en_US: {
    is: (subject, value) => `${subject} is ${value}.`,
    perSkill: (champion, label) => `${label} for each of ${champion}'s abilities:`,
    skillset: (champion) => `${champion}'s abilities:`,
    effects: (subject, list) => `${subject} applies ${list}.`,
    none: (subject) => `${subject} is not in the data.`,
    joiner: ", ",
    focus: { cooldown: "Cooldown", cost: "Cost", ratio: "Ratios", damage: "Damage", effect: "Effects" },
    it: "It",
  },
  zh_CN: {
    is: (subject, value) => `${subject}为 ${value}。`,
    perSkill: (champion, label) => `${champion} 各技能的${label}：`,
    skillset: (champion) => `${champion} 的技能构成：`,
    effects: (subject, list) => `${subject}的效果为${list}。`,
    none: (subject) => `资料中没有${subject}。`,
    joiner: "，",
    focus: { cooldown: "冷却时间", cost: "消耗", ratio: "加成系数", damage: "伤害", effect: "效果" },
    it: "该技能",
  },
};

/** 스킬 하나에서 질문이 가리킨 값을 꺼낸다. 카드가 쓰는 것과 같은 규칙이다. */
function focusValue(spell: SpellFact, focus: string): string | undefined {
  if (focus === "cooldown") return cooldownFact(spell)?.value;
  if (focus === "cost") return spell.cost || undefined;
  if (focus === "ratio") {
    const ratios = Object.entries(spell.ratios ?? {});
    return ratios.length ? ratios.map(([stat, value]) => `${stat} ${value}%`).join(", ") : undefined;
  }
  return undefined;
}

/**
 * 질문이 가리킨 사실의 이름.
 *
 * 쿨타임은 카드가 쓰는 말을 그대로 가져온다. 충전형 스킬이 섞이면 "재충전 대기시간"
 * 이 되어 표의 머리와 글의 말이 달라지기 때문이다. 나머지는 고정 이름을 쓴다.
 */
function focusLabel(answer: Extract<AdvisorAnswer, { kind: "champion" }>, w: ProseWords): string {
  if (answer.focus === "cooldown") {
    for (const spell of answer.card.spells) {
      const fact = cooldownFact(spell);
      if (fact) return fact.label;
    }
  }
  return w.focus[answer.focus ?? ""] ?? (answer.focus ?? "");
}

/**
 * 대화에 실을 답문을 만든다. 만들 수 없으면 비운다(카드만 나간다).
 *
 * 규칙 답은 이미 문장이 대화에 실리므로 건드리지 않는다.
 */
export function answerProse(answer: AdvisorAnswer, lang: Language = "ko_KR"): string {
  const w = WORDS[lang] ?? WORDS.ko_KR;

  if (answer.kind === "spell") {
    const title = `${answer.championName} ${answer.spell.slot} ${answer.spell.name}`;
    const lines: string[] = [];
    if (answer.headline) lines.push(w.is(`${title} ${answer.headline.label}`, answer.headline.value));
    else if (answer.highlighted.length) lines.push(answer.highlighted.join(" "));
    else lines.push(spellOneLiner(answer.spell));
    // 두 번째 문장에서 이름을 다시 대면 "말파이트 R 멈출 수 없는 힘" 이 두 줄 연속으로
    // 나온다. 앞에서 누구인지 밝혔으므로 여기서는 가리키는 말이면 된다.
    if (answer.spell.effects.length && answer.headline) {
      lines.push(w.effects(w.it, answer.spell.effects.map((tag) => translateTag(tag, lang)).join(w.joiner)));
    }
    return lines.join(" ");
  }

  if (answer.kind === "champion") {
    const name = answer.card.name;
    const focus = answer.focus;
    if (focus) {
      const label = focusLabel(answer, w);
      const rows = answer.card.spells
        .map((spell) => {
          const value = focusValue(spell, focus);
          return value ? `${spell.slot} ${spell.name} ${value}` : undefined;
        })
        .filter((row): row is string => Boolean(row));
      if (rows.length === 0) return "";
      return `${w.perSkill(name, label)} ${rows.join(w.joiner)}.`;
    }
    // 이름만 늘어놓으면 "P 화강암 방패, Q 지진의 파편…" 으로 끝나 아무것도 안 알려 준다.
    // 스킬마다 쿨·효과 한 줄을 붙인다. 카드에 이미 있는 값이라 지어내는 부분이 없다.
    if (answer.view === "skills") {
      const lines = answer.card.spells.map((spell) => `- ${spell.slot} ${spell.name}: ${spellOneLiner(spell)}`);
      return [w.skillset(name), ...lines].join("\n");
    }
    return "";
  }

  if (answer.kind === "compare" && answer.headline) {
    return w.is(answer.headline.label, answer.headline.value);
  }

  if (answer.kind === "item") {
    if (answer.verdicts.length) {
      return answer.verdicts
        .map((verdict) => (verdict.evidence ? verdict.evidence : w.none(`${answer.itemName} ${translateTag(verdict.tag, lang)}`)))
        .join(" ");
    }
    if (answer.effects.length) {
      return w.effects(answer.itemName, answer.effects.map((effect) => effect.name).join(w.joiner));
    }
    return "";
  }

  return "";
}
