/**
 * XML 로 받는 상성 해설 — 시험만 하고 **쓰지 않는다**
 *
 * 앱 어디서도 부르지 않는다. 14쌍 맹검(1~5점, 2026-09-24):
 *
 *   조립 답(digestSections)   4.00   4점 이상 14/14
 *   4B 기존(산문)             3.64   10/14
 *   4B XML                    2.79    2/14   세 칸 온전 14/14 · 대체한 칸 6/42
 *   0.8B XML                  1.71    3/14   세 칸 온전 11/14 · 대체한 칸 10/42
 *
 * 형식과 슬롯은 풀렸다 — 4B 는 형식을 한 번도 안 어겼고 스킬 태그는 전부 카드에서
 * 채워졌다. 그런데 **내용이 나빠졌다.** 칸이 "한두 문장" 으로 좁아지자 4B 는 검증된
 * 사실을 옮기는 대신 그럴듯한 말을 지었다(노트를 옮긴 문장 23% → 15%). 스킬을 아이템처럼
 * 샀고("W 무기 강화를 사고"), "케이틀린은 평타 사거리가 짧다" 처럼 사실을 뒤집었다.
 * 이런 문장은 짝이 틀린 것이 아니라서 근거 검사를 지나간다. 0.8B 는 형식을 지키고 칸을
 * 비슷한 말로 채웠다("오공과 럼블은 서로 다른 스킬을 사용합니다").
 *
 * 형식을 강제하는 것은 반복·슬롯 같은 **겉** 문제를 풀지만 내용은 풀지 못한다. 겉 문제는
 * 이미 반복 차단(loopGuard)과 슬롯 붙이기(labelSlots)가 풀었다.
 *
 * 모델에게 산문 대신 칸이 정해진 XML 을 쓰게 한다.
 *
 *   <answer>
 *   <watch>…</watch>   조심할 것
 *   <build>…</build>   무엇을 먼저 사고 올릴지
 *   <fight>…</fight>   언제 어떻게 싸울지
 *   </answer>
 *
 * **스킬은 이름을 쓰지 않고 `<skill>럼블 E</skill>` 로 부른다.** 이름과 슬롯은 코드가
 * 카드에서 채운다. 산문으로 받을 때는 모델이 슬롯을 떨구거나(럼블의 화염방사기) 틀리게
 * 붙였고(P 찌르기), 남의 스킬을 내 것으로 썼다. 태그로 받으면 챔피언과 슬롯이 카드에 있는지
 * 코드가 확인할 수 있다 — 없는 스킬을 부른 문장은 버린다.
 *
 * 칸마다 근거 검사(`groundCommentary`)를 다시 돌리고, 칸이 비거나 형식이 깨지면 그 칸만
 * 노트 조립(`digestSections`)으로 채운다. 모델이 무엇을 쓰든 화면에는 세 칸이 선다.
 */
import type { Language } from "@/i18n";
import type { AdvisorAnswer } from "./answer";
import { extremeStatsLine } from "./answer";
import { groundCommentary, labelSlots } from "./grounding";
import { digestSections, type DigestSection } from "./prose";
import { translateDamage, translateTag } from "./promptLocale";
import { josa } from "../../../scripts/llm/lib/text";

type Compare = Extract<AdvisorAnswer, { kind: "compare" }>;
const KEYS: DigestSection["key"][] = ["watch", "build", "fight"];

const firstSentence = (text: string) => text.split(/(?<=[.!?])\s+/)[0]?.trim() ?? text;

/** 한국어 상성 답만 짓는다. 다른 답은 undefined. */
export function buildXmlMatchupPrompt(answer: AdvisorAnswer, patch: string, lang: Language): string | undefined {
  if (lang !== "ko_KR" || answer.kind !== "compare" || !answer.matchup) return undefined;
  const [me, enemy] = answer.cards;
  if (!me || !enemy) return undefined;
  const tags = (list: string[]) => list.map((tag) => translateTag(tag, lang)).join(", ");
  const plan = answer.notes?.plan;
  const lines = [
    `[패치] ${patch}`,
    `[상성] 사용자는 ${josa(me.name, "로/으로")} ${josa(enemy.name, "을/를")} 상대합니다. ${me.name} 시점으로 씁니다.`,
    "[스킬]",
    ...[me, enemy].flatMap((card) =>
      card.spells.map((spell) => `- ${card.name} ${spell.slot} ${spell.name}${spell.effects.length ? `: ${tags(spell.effects)}` : ""}`),
    ),
    "[특징]",
    ...[me, enemy].map((card) => {
      const extremes = extremeStatsLine(card, lang);
      return `- ${card.name}: 주 피해 ${translateDamage(card.damageProfile.primary, lang)}${extremes ? ` · ${extremes}` : ""}`;
    }),
  ];
  if (plan) {
    lines.push("[검증된 사실]");
    for (const claim of plan.claims) lines.push(`- ${claim.text}`);
    for (const entry of [...plan.mine, ...plan.enemy].slice(0, 10)) lines.push(`- (${entry.category}) ${firstSentence(entry.text)}`);
  }
  const example = enemy.spells.find((spell) => spell.slot === "E") ?? enemy.spells[1];
  lines.push(
    "",
    "[형식] 아래 XML 만 쓰십시오. 태그 밖에는 아무것도 쓰지 마십시오.",
    "<answer>",
    `<watch>${enemy.name}의 어느 스킬을 조심할지, 왜 위험한지 한두 문장</watch>`,
    `<build>${josa(me.name, "이/가")} 무엇을 먼저 사고 어떤 저항을 올릴지 한두 문장</build>`,
    `<fight>${josa(me.name, "이/가")} 언제 어떻게 싸울지 한두 문장</fight>`,
    "</answer>",
    `- 스킬을 말할 때는 스킬 이름을 쓰지 말고 <skill>챔피언 슬롯</skill> 로만 씁니다. 예: <skill>${enemy.name} ${example?.slot ?? "E"}</skill>`,
    "- 위 [검증된 사실]에 있는 내용만 씁니다. 자료에 없는 스킬·아이템 이름을 만들지 않습니다.",
    "- 수치·목록·인사말을 쓰지 않습니다. 합니다체로 씁니다.",
  );
  return lines.join("\n");
}

const PARTICLES: Array<[RegExp, "은/는" | "이/가" | "을/를" | "와/과" | "로/으로"]> = [
  [/^(은|는)(?=[\s,.!?]|$)/, "은/는"],
  [/^(이|가)(?=[\s,.!?]|$)/, "이/가"],
  [/^(을|를)(?=[\s,.!?]|$)/, "을/를"],
  [/^(와|과)(?=[\s,.!?]|$)/, "와/과"],
  [/^(으로|로)(?=[\s,.!?]|$)/, "로/으로"],
];

/** 이름 바로 뒤 조사를 이름의 받침에 맞춘다. */
function fixParticles(text: string, names: string[]): string {
  let out = text;
  for (const name of [...new Set(names)].filter((n) => n.length >= 2).sort((a, b) => b.length - a.length)) {
    let from = 0;
    for (;;) {
      const at = out.indexOf(name, from);
      if (at < 0) break;
      const end = at + name.length;
      const rest = out.slice(end);
      for (const [re, pair] of PARTICLES) {
        const m = re.exec(rest);
        if (m) {
          const right = josa(name, pair).slice(name.length);
          out = out.slice(0, end) + right + rest.slice(m[0].length);
          break;
        }
      }
      from = end;
    }
  }
  return out;
}

export interface XmlSectionReport {
  key: DigestSection["key"];
  /** 모델 글을 썼는가, 노트 조립으로 대체했는가 */
  source: "model" | "digest";
  /** 대체한 까닭 */
  reason?: "missing" | "empty-after-check";
  /** 걷어낸 문장 수 — 없는 스킬을 불렀거나 근거 검사에 걸린 것 */
  dropped: number;
}

export interface XmlRender {
  text: string;
  sections: XmlSectionReport[];
  /** 세 칸이 다 있었는가 */
  wellFormed: boolean;
}

/**
 * 모델이 쓴 XML 을 화면 글로 옮긴다.
 *
 * `<skill>` 은 "챔피언 슬롯" 이어야 한다. 챔피언은 이 상성의 둘 중 하나, 슬롯은 P/Q/W/E/R.
 * 어긋나면 그 태그가 든 문장을 버린다 — 틀린 스킬을 이름으로 채워 넣으면 그럴듯한 거짓이 된다.
 */
export function renderXmlMatchup(raw: string, answer: Compare, lang: Language = "ko_KR"): XmlRender {
  const cards = answer.cards;
  const fallback = new Map(digestSections(answer, lang).map((section) => [section.key, section]));
  const titles = new Map([...fallback.values()].map((section) => [section.key, section.title]));
  const body = /<answer>([\s\S]*?)(?:<\/answer>|$)/.exec(raw)?.[1] ?? raw;
  const reports: XmlSectionReport[] = [];
  const parts: string[] = [];
  let present = 0;

  for (const key of KEYS) {
    const inner = new RegExp(`<${key}>([\\s\\S]*?)</${key}>`).exec(body)?.[1];
    let dropped = 0;
    let text = "";
    if (inner !== undefined) {
      present += 1;
      // 태그를 채우고, 못 채우는 태그가 든 문장은 버린다
      const sentences = inner
        .replace(/\s+/g, " ")
        .trim()
        .split(/(?<=[.!?])\s+/)
        .filter(Boolean);
      const resolved: string[] = [];
      for (const sentence of sentences) {
        let broken = false;
        const filled = sentence
          .replace(/<skill>\s*([^<]+?)\s*<\/skill>/g, (_, ref: string) => {
            const match = /^(.+?)\s*([PQWER])$/.exec(ref.trim());
            const card = match && cards.find((c) => c.name === match[1].trim() || c.name.replace(/\s/g, "") === match[1].replace(/\s/g, ""));
            const spell = card?.spells.find((s) => s.slot === match![2]);
            if (!card || !spell) {
              broken = true;
              return "";
            }
            return `${card.name} ${spell.slot} ${spell.name}`;
          })
          .replace(/<\/?[a-z][^>]*>/gi, "")
          .trim();
        // 모델은 이름을 모른 채 태그 뒤에 조사를 붙인다("<skill>럼블 E</skill>는" → "전기 작살는").
        // 채운 이름의 받침에 맞춰 고친다.
        const fixed = fixParticles(filled, cards.flatMap((c) => c.spells.map((spell) => spell.name)));
        if (broken || !fixed) dropped += 1;
        else resolved.push(fixed);
      }
      const grounded = groundCommentary(resolved.join(" "), answer, lang);
      dropped += grounded.dropped.length;
      text = grounded.text;
    }
    const title = titles.get(key) ?? key;
    if (text) {
      reports.push({ key, source: "model", dropped });
      parts.push(`**${title}**\n${labelSlots(text, cards)}`);
    } else {
      const lines = fallback.get(key)?.lines ?? [];
      reports.push({ key, source: "digest", reason: inner === undefined ? "missing" : "empty-after-check", dropped });
      if (lines.length) parts.push(`**${title}**\n${labelSlots(lines.join(" "), cards)}`);
    }
  }
  return { text: parts.join("\n\n"), sections: reports, wellFormed: present === KEYS.length };
}
