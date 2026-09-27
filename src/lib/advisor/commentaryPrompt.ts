import type { Language } from "@/i18n";
import { extremeStatsLine, spellSummary, type AdvisorAnswer } from "./answer";
import { promptWords, translateDamage, translateScaling, translateTag } from "./promptLocale";

/**
 * 모델에게 넘길 해설 재료.
 *
 * 카드가 이미 수치를 그렸으므로 모델은 **수치를 되풀이하지 않고 뜻만 잇는다.**
 * 재료는 코드가 계산한 것(백분위 극단, 주 피해 유형, 계수 성향, 태그)이다.
 * 이번 세션에서 모델이 스스로 판단하면 틀리는 것을 봤다(럼블 E 가 마저를 안 깎는다고 답함).
 * 그래서 판단할 재료를 전부 주고 문장만 만들게 한다.
 */
/**
 * 해설 재료를 만든다.
 *
 * `lang` 은 **답이 나올 언어**다. 자료의 챔피언·스킬 이름은 카드가 그 로케일로
 * 실려 오지만, 효과 태그와 능력치 등급은 파이프라인이 한국어 리터럴로 타입을
 * 잡고 있어 여기서 옮긴다(promptLocale).
 *
 * 지시문까지 옮기지 않으면 모델이 지시문의 언어를 따라간다. 영어로 물어도
 * 한국어 답이 나왔던 원인이 이것이다.
 */
export function buildCommentaryPrompt(
  answer: AdvisorAnswer,
  patch: string,
  lang: Language = "ko_KR",
): string | undefined {
  const w = promptWords(lang);
  const rules = w.rules;
  const tags = (list: string[]): string => list.map((tag) => translateTag(tag, lang)).join(", ");

  if (answer.kind === "champion") {
    // 스킬 표(쿨·소모·계수…)는 조회다. 카드가 곧 답.
    if (answer.focus) return undefined;
    const card = answer.card;
    const lines = [`[${w.patch}] ${patch}`, `[${w.champion}] ${card.name}`];
    if (card.wiki?.subclass) lines.push(`- ${w.subclassLine(card.wiki.subclass, card.wiki.positions?.[0])}`);
    lines.push(`- ${w.damageLine(translateDamage(card.damageProfile.primary, lang), translateScaling(card.scalingProfile.primary, lang))}`);
    const extremes = extremeStatsLine(card, lang);
    if (extremes) lines.push(`- ${extremes}`);
    if (answer.view === "skills") {
      lines.push(`[${w.skills}]`);
      for (const spell of card.spells) lines.push(`- ${spell.slot} ${spell.name}: ${spellSummary(spell)}`);
    } else {
      // 스킬 이름과 그 스킬의 효과를 **붙여서** 준다.
      //
      // 처음에는 이름만 줬다. 지어내기는 멈췄지만 이번엔 짝을 틀리게 붙였다.
      // 야스오 P 낭인의 길에 에어본·투사체 차단·돌진을 몰아 주고, 말파이트 Q
      // 지진의 파편에 에어본을 붙였다. 이름 목록과 태그 뭉치를 따로 주면 어느
      // 태그가 어느 스킬 것인지는 모델이 찍는 수밖에 없다. 카드에 스킬마다
      // effects 가 이미 붙어 있으므로 그대로 옮긴다.
      lines.push(`[${w.abilities}]`);
      for (const spell of card.spells) {
        const effects = spell.effects.length ? `: ${tags(spell.effects)}` : "";
        lines.push(`- ${spell.slot} ${spell.name}${effects}`);
      }
    }
    // 운용 노트는 한국어로만 있다(플레이북이 한국어다). 영어·중국어 프롬프트에
    // 한국어 문단을 섞으면 모델이 그 언어를 따라가 답까지 한국어가 된다.
    // 그래서 한국어일 때만 싣는다. 노트가 빠져도 태그와 능력치로 답은 나온다.
    const notes = lang === "ko_KR" ? answer.notes : undefined;
    if (notes && (notes.playing.length || notes.against.length)) {
      lines.push(w.notesHeader);
      // 물은 쪽을 먼저 싣는다. 재료 순서가 곧 글 순서가 된다.
      const blocks = notes.perspective === "against"
        ? ([[w.against, notes.against], [w.playing, notes.playing]] as const)
        : ([[w.playing, notes.playing], [w.against, notes.against]] as const);
      for (const [label, list] of blocks) for (const note of list) lines.push(`- ${label}: ${note}`);
    }
    const hasNotes = Boolean(notes && (notes.playing.length || notes.against.length));
    lines.push("", ...rules);
    if (answer.view === "skills") {
      // "스킬셋이 어떻게 되어 있지" 는 스킬 다섯 개가 어떻게 맞물리는지를 묻는 것이다.
      // 스킬 하나하나의 설명은 카드에 있으니, 모델은 그 사이의 관계를 말한다.
      lines.push(w.closing.skills);
    } else if (hasNotes) {
      lines.push(w.closing.championWithNotes);
      // 어느 쪽을 물었는지는 조사로 이미 갈라 두었다. 모델에게 다시 가리게 하지 않는다.
      if (notes && notes.perspective !== "both") {
        lines.push(w.perspectiveOnly(notes.perspective === "against" ? w.against : w.playing));
      }
    } else {
      lines.push(w.closing.champion);
    }
    return lines.join("\n");
  }

  if (answer.kind === "spell") {
    // 쿨·소모·계수 하나를 물은 질문에는 해설을 붙이지 않는다. 재료가 숫자 하나뿐이라
    // 모델이 할 말이 없고, 실제로 10초 쿨을 "매우 짧다" 고 지어냈다. 카드가 곧 답이다.
    if (answer.highlighted.length === 0) return undefined;
    const lines = [
      `[${w.patch}] ${patch}`,
      `[${w.spell}] ${answer.championName} ${answer.spell.slot} ${answer.spell.name}`,
    ];
    if (answer.headline) lines.push(`- ${answer.headline.label}: ${answer.headline.value}`);
    for (const sentence of answer.highlighted) lines.push(`- ${sentence}`);
    if (answer.spell.effects.length) lines.push(`- ${w.effects}: ${tags(answer.spell.effects)}`);
    lines.push("", ...rules, w.closing.spell);
    return lines.join("\n");
  }

  if (answer.kind === "compare") {
    // 한 능력치·한 스킬 사실을 물은 비교는 헤드라인이 곧 답이다. 해설은 열린 비교
    // ("둘 중 누가 더 세?") 와 상성 질문에만 붙인다. 재료는 각자의 극단 능력치와 피해·계수 성향.
    if (!answer.matchup && (answer.headline || answer.slot)) return undefined;
    const [me, enemy] = answer.cards;
    const lines = [
      `[${w.patch}] ${patch}`,
      answer.matchup && enemy
        ? w.matchup(me.name, enemy.name)
        : `[${w.compare}] ${answer.cards.map((card) => card.name).join(" vs ")}`,
    ];
    for (const card of answer.cards) {
      const traits: string[] = [];
      if (card.wiki?.subclass) traits.push(card.wiki.subclass);
      traits.push(w.damageLine(translateDamage(card.damageProfile.primary, lang), translateScaling(card.scalingProfile.primary, lang)));
      const extremes = extremeStatsLine(card, lang);
      if (extremes) traits.push(extremes);
      /*
       * 비교에서도 스킬과 효과를 붙여서 준다. 따로 주면 짝을 틀리게 붙인다.
       *
       * 여기서는 이름 앞에 임자까지 붙인다. 줄머리에 `- 럼블:` 이 있어도 0.8B 는
       * 스킬 다섯 개를 읽는 사이에 그것을 놓치고 "오공은 P 고철장 거인" 을 썼다.
       * 이름마다 임자를 달아 두면 놓칠 자리가 없다.
       *
       * 열네 쌍을 두 번 돌려 쟀다. 근거 검사가 걷어낸 문장이 118 → 53 으로 줄고
       * 무한 반복이 5 → 2 로 줄었다. 두 번 다 같은 방향이었다.
       */
      traits.push(
        `${w.abilities}: ${card.spells
          .map((spell) => `${card.name} ${spell.slot} ${spell.name}${spell.effects.length ? `(${tags(spell.effects)})` : ""}`)
          .join(" · ")}`,
      );
      lines.push(`- ${card.name}: ${traits.join(" · ")}`);
    }
    /*
     * 상성 노트를 싣는다.
     *
     * 여기에만 노트가 빠져 있었다. 그래서 상성 질문에서는 모델이 카드 두 장만 보고
     * 글을 지어야 했고, 실제로 "오공은 마법으로 주 피해를 받습니다" 처럼 카드를
     * 거꾸로 읽은 글이 나왔다. 챔피언 하나를 묻는 자리에는 진작 노트가 들어가고
     * 있었는데 조합을 묻는 자리만 비어 있었던 것이다.
     *
     * 재료에는 두 가지가 들어간다. 두 카드에서 그 자리에서 도출한 문장과, 사람이
     * 검증해 둔 플레이북 문장이다. 도출한 쪽이 이 조합을 직접 말하므로 앞에 온다.
     */
    /*
     * 언어를 가리지 않는다.
     *
     * 예전에는 한국어일 때만 실었다. 노트가 한국어뿐이라 섞으면 모델이 한국어로
     * 답해 버렸기 때문이다. 그런데 그 바람에 영어·중국어 사용자는 상성 지식을
     * 하나도 못 받았다 — 카드만 보고 글을 지어야 했다.
     *
     * 이제 `matchupNotes` 가 언어별로 도출 문장을 짓고, 손으로 쓴 한국어 노트는
     * 한국어일 때만 붙인다. 여기까지 온 글은 그 화면의 언어로 쓰여 있다.
     */
    const matchupNotes = answer.notes;
    if (matchupNotes && (matchupNotes.mine.length || matchupNotes.enemy.length)) {
      lines.push(w.notesHeader);
      for (const note of matchupNotes.mine) lines.push(`- ${me.name}: ${note}`);
      for (const note of matchupNotes.enemy) lines.push(`- ${enemy?.name ?? ""}: ${note}`);
    }
    lines.push(
      "",
      ...rules,
      answer.matchup && enemy ? w.closing.matchup(me.name, enemy.name) : w.closing.compare,
    );
    return lines.join("\n");
  }

  // 규칙 답에는 해설을 붙이지 않는다. 배지와 근거 문장이 곧 답이라, 모델은 그 문장을
  // 되풀이할 뿐이었다("점화 스킬을 사용하면 정복자 중첩이 두 개 추가로 적용됩니다").
  // 되풀이는 분석이 아니고, 기다리게만 한다.
  return undefined;
}
