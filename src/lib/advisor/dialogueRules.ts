/** 문서의 공식으로 계산할 수 있는 규칙과, 없는 지식을 다른 문서로 대신하지 않는 범위 처리. */
import type { AnswerPlan, PlanContext } from "./plan";
import type { DialogueMemory } from "./dialogueState";

const rulePlan = (title: string, text: string): AnswerPlan => ({ type: "code", answer: `### ${title}\n${text}` });

export function resolveDialogueRule(question: string, ctx: PlanContext): AnswerPlan | undefined {
  if (ctx.lang !== "ko_KR" || !ctx.data) return undefined;
  const penetration = ctx.data.mechanics.find(m => m.id === "관통과-감소,-그리고-적용-순서");
  if (/관통/.test(question) && penetration?.text.includes("비율 관통  →  4) 고정 관통")) {
    const armor = /방어력(?:이|은|\s)*(\d+(?:\.\d+)?)/.exec(question)?.[1];
    const percent = /(\d+(?:\.\d+)?)\s*%\s*관통/.exec(question)?.[1];
    const flat = /고정\s*관통\s*(\d+(?:\.\d+)?)/.exec(question)?.[1];
    if (armor && percent && flat && Number(percent) <= 100) {
      const remaining = Math.max(0, Number(armor) * (1 - Number(percent) / 100) - Number(flat));
      return rulePlan("관통 계산", `비율 관통을 먼저, 고정 관통을 나중에 적용합니다. 방어력 ${armor} × (1 − ${percent}/100) − ${flat} = ${Number(remaining.toFixed(2))}입니다. 대상의 실제 방어력을 바꾸는 감소와 달리, 관통은 내 물리 피해 계산에만 적용됩니다.`);
    }
  }
  if (/치유\s*감소|치감|고통스러운\s*상처/.test(question) && /중첩|보호막|실드/.test(question)) {
    const topic = /중첩/.test(question) ? "치유 감소의 중첩 여부" : "치유 감소가 보호막에 적용되는지";
    return rulePlan("치유 감소", `${topic}는 현재 규칙 자료에 정리되어 있지 않습니다. 아이템 설명에 있는 치유 감소 수치만으로 이 상호작용을 단정할 수 없습니다.`);
  }
  if (/프리징|freeze|freezing/i.test(question) && /풀|해제|깨|break/i.test(question)) {
    return rulePlan("프리징", "현재 자료에는 프리징을 푸는 절차가 정리되어 있지 않습니다. 내 챔피언과 상대 챔피언을 알려주면 저장된 라인전 조언을 찾아드릴 수 있습니다.");
  }
  return undefined;
}

export function ruleEllipsis(question: string, memory: DialogueMemory, ctx: PlanContext): AnswerPlan | undefined {
  if (ctx.lang !== "ko_KR" || memory.active !== "rule" || !memory.rule?.title.includes("관통")) return undefined;
  if (!/그거|그럼|관통/.test(question) || !/평타|기본\s*공격/.test(question)) return undefined;
  const source = ctx.data!.mechanics.find(m => m.id === "저항과-피해-감소");
  if (!source?.text.includes("방어력은 물리 피해")) return undefined;
  return { type: "code", answer: { kind: "text", text: "물리 피해인 기본 공격에는 적용됩니다. 물리 관통력과 방어구 관통력은 방어력을 계산할 때 쓰므로, 같은 공격에 섞인 마법 피해나 고정 피해에는 적용되지 않습니다." } };
}
