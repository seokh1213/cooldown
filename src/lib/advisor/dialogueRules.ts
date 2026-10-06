/** 문서의 공식으로 계산할 수 있는 규칙과, 없는 지식을 다른 문서로 대신하지 않는 범위 처리. */
import type { AnswerPlan, PlanContext } from "./plan";
import type { DialogueMemory } from "./dialogueState";
import type { ResolvedQuestion } from "./resolvedQuestion";
import { mentionsSearchDocument } from "./searchFallback";
import { matchesMechanicsQuestion, mechanicsToText } from "@/lib/knowledge/mechanics";

const rulePlan = (title: string, text: string): Extract<AnswerPlan, { type: "code" }> => ({ type: "code", answer: `### ${title}\n${text}` });

export function isPenetrationRule(rule: DialogueMemory["rule"]): boolean {
  return rule?.id === "meta:lethality" || /관통|치명력/.test(rule?.title ?? "");
}

export function penetrationCalculation(question: string, ctx: PlanContext): AnswerPlan | undefined {
  if (ctx.lang !== "ko_KR" || !/관통/.test(question) || /감소|마법|저항력/.test(question)) return undefined;
  const source = ctx.data?.mechanics.find(m => m.id === "관통과-감소,-그리고-적용-순서");
  if (!source || !/3\)\s*비율 관통\s*→\s*4\)\s*고정 관통/.test(source.text)) return undefined;
  const armor = /방어력(?:이|은|\s)*(-?\d+(?:\.\d+)?)/.exec(question)?.[1];
  const percentages = [...question.matchAll(/(-?\d+(?:\.\d+)?)\s*%\s*관통/g)];
  const flats = [...question.matchAll(/고정\s*관통\s*(-?\d+(?:\.\d+)?)/g)];
  if (armor === undefined || percentages.length !== 1 || flats.length !== 1) return undefined;
  const percent = percentages[0][1], flat = flats[0][1];
  if (![armor, percent, flat].every(value => Number.isFinite(Number(value)) && Number(value) >= 0) || Number(percent) > 100) return undefined;
  const remaining = Math.max(0, Number(armor) * (1 - Number(percent) / 100) - Number(flat));
  return { ...rulePlan("관통 계산", `비율 관통을 먼저, 고정 관통을 나중에 적용합니다. 방어력 ${armor} × (1 − ${percent}/100) − ${flat} = ${Number(remaining.toFixed(2))}입니다. 대상의 실제 방어력을 바꾸는 감소와 달리, 관통은 내 물리 피해 계산에만 적용됩니다.`),
    knowledge: { id: `mech:${source.id}`, title: source.title } };
}

export function resolveDialogueRule(question: string, ctx: PlanContext): AnswerPlan | undefined {
  if (ctx.lang !== "ko_KR" || !ctx.data) return undefined;
  const calculation = penetrationCalculation(question, ctx);
  if (calculation) return calculation;
  if (/치유\s*감소|치감|고통스러운\s*상처/.test(question) && /중첩|보호막|실드/.test(question)) {
    const topic = /중첩/.test(question) ? "치유 감소의 중첩 여부" : "치유 감소가 보호막에 적용되는지";
    return rulePlan("치유 감소", `${topic}는 아직 확인할 수 없어요.`);
  }
  if (/치감|치유\s*감소|고통스러운\s*상처/.test(question) && /뜻|뭐|무슨|의미/.test(question)) {
    const source = ctx.data.items.find(item => item.description?.includes("고통스러운 상처") && item.description.includes("치유 및 회복 효과를 감소"));
    if (source) return { type: "code", answer: { kind: "text", text: "치감은 ‘치유 감소’의 줄임말이에요. 아이템 설명에서 ‘고통스러운 상처’로 표시되며, 치유 및 회복 효과를 감소시킵니다." } };
  }
  if (/프리징|freeze|freezing/i.test(question) && /풀|해제|깨|break/i.test(question)) {
    return rulePlan("프리징", "프리징을 푸는 방법은 아직 확인할 수 없어요. 내 챔피언과 상대 챔피언을 알려주면 라인전 조언을 드릴 수 있어요.");
  }
  return undefined;
}

export function ruleEllipsis(resolved: ResolvedQuestion, memory: DialogueMemory, ctx: PlanContext): AnswerPlan | undefined {
  const question = resolved.text;
  const note = memory.active === "rule" && !resolved.champions.length && !resolved.slot
    ? ctx.data?.mechanics.find(section => section.evidence && `mech:${section.id}` === memory.rule?.id) : undefined;
  if (note) {
    const localized = ctx.lang === "ko_KR" ? undefined : note.localized?.[ctx.lang];
    const doc = { title: localized?.title ?? note.title, text: localized?.text ?? note.text };
    // 저장한 노트를 가리키는 내용어가 있어야 이어 쓴다. 새 주제는 이전 답변으로 채우지 않는다.
    const namesTopic = note.questionGroups?.some(group => matchesMechanicsQuestion({ questionGroups: [group] }, question));
    if (namesTopic || mentionsSearchDocument(doc, question)) return { type: "code", answer: mechanicsToText([note], ctx.lang)!,
      knowledge: { id: `mech:${note.id}`, title: doc.title } };
  }
  if (ctx.lang !== "ko_KR" || memory.active !== "rule" || !isPenetrationRule(memory.rule)) return undefined;
  if (!/그거|그럼|관통/.test(question) || !/평타|기본\s*공격/.test(question)) return undefined;
  const source = ctx.data!.mechanics.find(m => m.id === "저항과-피해-감소");
  if (!source?.text.includes("방어력은 물리 피해")) return undefined;
  return { type: "code", answer: { kind: "text", text: "물리 피해인 기본 공격에는 적용됩니다. 물리 관통력과 방어구 관통력은 방어력을 계산할 때 쓰므로, 같은 공격에 섞인 마법 피해나 고정 피해에는 적용되지 않습니다." } };
}
