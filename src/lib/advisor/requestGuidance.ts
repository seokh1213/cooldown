/** 지원 범위와 근거 부족을 숨기지 않고 다음 질문의 형태를 제안한다. */
import type { Language } from "@/i18n";

export type GuidanceReason = "scope" | "perspective" | "evidence" | "unsupported" | "answerMismatch";
const GUIDANCE: Record<Language, Record<GuidanceReason, string>> = {
  ko_KR: {
    scope: "상성 조언은 한 번에 두 쌍까지, 수치 비교는 챔피언 10명까지 답할 수 있어요. 내 챔피언과 상대 한두 명으로 줄여 주세요. 예: ‘오공으로 럼블·모데 상대법’, 또는 ‘오공 vs 럼블, 아리 vs 제드 상대법’. 수치라면 ‘오공·문도 1레벨 체력 비교’처럼 물어봐 주세요.",
    perspective: "어느 챔피언으로 상대하나요? 내 챔피언 한 명과 상대 한두 명을 알려 주세요. 예: ‘오공으로 럼블·모데 상대법’. 서로 다른 상성 두 쌍도 물어볼 수 있어요.",
    evidence: "그 조건에서의 결과는 현재 근거 자료로 확인할 수 없어요. 확인된 스킬 효과나 기본 쿨타임은 조회할 수 있어요. 예: ‘아리 E 쿨타임’, ‘점화가 은신을 드러내?’처럼 범위를 줄여 물어봐 주세요.",
    unsupported: "이 요청은 여기서 해결하기 어려워요. 롤 스킬·능력치·룬·아이템 조회와 근거가 있는 상성 조언을 도와줄 수 있어요. 예: ‘오공 공속’, ‘아리로 제드 상대법’. 계정·결제 문제는 공식 고객지원에 문의해 주세요.",
    answerMismatch: "요청한 내용에 맞는 근거를 찾지 못했어요. 내 챔피언과 상대, 궁금한 상황을 한 가지씩 알려 주세요. 예: ‘아리로 제드 상대할 때 E 없이 궁 대응은?’ 또는 ‘오공 1레벨 공속’.",
  },
  en_US: {
    scope: "I can cover up to two matchup pairs or compare stats for up to 10 champions per question. Please narrow the request: ‘Wukong against Rumble and Mordekaiser’, or ‘Wukong vs Rumble and Ahri vs Zed, matchup tips’.",
    perspective: "Which champion are you playing? Name your champion and one or two opponents, for example ‘As Wukong against Rumble and Mordekaiser’. Two separate matchup pairs also work.",
    evidence: "The current sources don't confirm the result under that condition. Try a narrower ability question, such as ‘Ahri E cooldown’ or ‘Does Ignite reveal stealth?’.",
    unsupported: "I can't resolve that request here. I can look up LoL abilities, stats, runes and items, and offer sourced matchup advice. Try ‘Wukong attack speed’ or ‘Ahri vs Zed tips’. For account or payment issues, contact official support.",
    answerMismatch: "I couldn't find evidence that answers this request. Specify your champion, opponent and one situation, for example ‘Ahri vs Zed: how to handle his ult without E?’.",
  },
  zh_CN: {
    scope: "每次可以回答最多两组对局建议，或比较最多10个英雄的属性。请缩小范围，例如‘孙悟空对线兰博和莫德凯撒’，或分别询问两组1对1的对局。",
    perspective: "你使用哪个英雄？请提供自己的英雄和一到两个对手，例如‘我用孙悟空对线兰博和莫德凯撒’。也可以询问两组独立对局。",
    evidence: "当前资料无法确认这个条件下的结果。可以查询已确认的技能效果或基础冷却，例如‘阿狸E冷却’或‘点燃能显露隐身吗？’。",
    unsupported: "这里暂时无法解决这个请求。可以查询英雄联盟技能、属性、符文和装备，以及有资料依据的对局建议。例：‘孙悟空攻速’、‘阿狸对线劫’。账号和支付问题请联系官方客服。",
    answerMismatch: "没有找到直接回答此问题的依据。请给出自己的英雄、对手和一个具体情况，例如‘阿狸对线劫，没有E时如何应对大招？’。",
  },
};

export function requestGuidance(reason: GuidanceReason, lang: Language): string {
  return GUIDANCE[lang][reason];
}
