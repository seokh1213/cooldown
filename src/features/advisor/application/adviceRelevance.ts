/** 질문의 행동과 대상을 원문 단위에 연결한다. 스킬 부재 자체를 질문의 대상으로 삼지 않는다. */
import type { AdviceSubjects } from "./adviceActions";
import { mentionsAbilityState } from "../retrieval/abilityStatus";

export type AdviceIntent = "engage" | "survive" | "trade" | "combo" | "general";
export interface AdviceQuestion { intent: AdviceIntent; target?: { owner: "mine" | "enemy"; slot: string } }
const INTENTS: Array<[AdviceIntent, RegExp]> = [
  ["combo", /콤보|연계|\bcombo\b|连招/i],
  ["survive", /버텨|생존|피하|어떻게\s*피해|어케\s*피해|피해\s*가는|대응|대처|막아|빠져|도망|surviv|avoid|dodge|escape|respond|躲|逃|应对/i],
  ["engage", /진입|들어가|붙어|붙는|올인|이니시|engage|go in|all.?in|进场|开团/i],
  ["trade", /딜교|교환|견제|\btrad(e|ing)\b|harass|换血|消耗/i],
];
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function adviceQuestion(question: string, subjects: AdviceSubjects): AdviceQuestion {
  const intent = INTENTS.find(([, pattern]) => pattern.test(question))?.[0] ?? "general";
  const refs = [...question.matchAll(/(?<![A-Za-z])([QWER])(?![A-Za-z])|궁(?:극기)?|\bult(?:imate)?\b|大招/gi)];
  let owner: "mine" | "enemy" | undefined;
  const targets: NonNullable<AdviceQuestion["target"]>[] = [];
  for (const [i, ref] of refs.entries()) {
    const prefix = question.slice(i ? refs[i - 1].index! + refs[i - 1][0].length : 0, ref.index);
    const markers = (["mine", "enemy"] as const).flatMap(side =>
      [...prefix.matchAll(new RegExp(`${escape(subjects[side].name)}|${side === "mine" ? "내(?=\\s*$)|\\bmy\\b|我的" : "상대|\\b(?:enemy|his|her|their)\\b|对面"}`, "gi"))]
        .map(m => ({ side, at: m.index })));
    const explicitOwner = markers.sort((a, b) => b.at - a.at)[0]?.side;
    owner = explicitOwner ?? (/[.!?。！？]/.test(prefix) ? undefined : owner);
    const suffix = question.slice(ref.index! + ref[0].length, refs[i + 1]?.index ?? question.length);
    const clause = suffix.split(/[.!?。！？]/)[0];
    const state = mentionsAbilityState(clause) && !/대응|대처|피하|피할|피하려|avoid|dodge|respond|应对|躲/i.test(clause);
    // 조건의 '내 E'를 별도로 물은 '궁 대응'의 주인으로 이어 붙이지 않는다.
    if (!explicitOwner && !state && intent === "survive" && /대응|대처|피하|피할|피하려|avoid|dodge|respond|应对|躲/i.test(suffix)) owner = "enemy";
    if (owner && !state) targets.push({ owner, slot: ref[1]?.toUpperCase() ?? "R" });
  }
  const named = (["mine", "enemy"] as const).flatMap(side => subjects[side].spells
    .filter(s => s.name.length > 1 && question.includes(s.name) && !mentionsAbilityState(question.slice(question.indexOf(s.name) + s.name.length)))
    .map(s => ({ owner: side, slot: s.slot })));
  return { intent, target: targets[targets.length - 1] ?? (named.length === 1 ? named[0] : undefined) };
}

/** 대상을 지목하면 그 스킬의 원문을 찾는다. 단순 스킬 설명을 무관한 실행 대안으로 쓰지 않는다. */
export function relevantAdvice(text: string, category: string, side: "mine" | "enemy", query: AdviceQuestion): boolean {
  if (query.target?.owner === "enemy") {
    return side === "enemy" && !(query.intent === "survive" && ["escape-window", "combo"].includes(category))
      && new RegExp(`(?:^|[^A-Za-z])${query.target.slot}(?![A-Za-z])`).test(text);
  }
  if (query.intent === "combo") return side === "mine" && category === "combo";
  if (query.intent === "engage") return /진입|개시|붙어|붙는|거리를 좁|접근|engage|approach|进场|接近/i.test(text);
  if (query.intent === "trade") return ["combo", "laning", "skill"].includes(category) && /교환|딜교|견제|파밍|급소|trade|harass|farm|换血|消耗|补刀/i.test(text);
  if (query.intent === "survive") return /피하|피합|물러|거리|범위\s*(?:밖|바깥)|미니언.*(?:사이|뒤)|보호|surviv|avoid|distance|shield|躲|距离|保护/i.test(text);
  return true;
}
