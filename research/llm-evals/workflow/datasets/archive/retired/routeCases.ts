/**
 * 질문 갈래 판정(`routePrompt`) 평가 문항
 *
 * 갈래마다 여섯, 언어마다 서른, 모두 아흔 문항이다. 세 언어는 같은 뜻을 그 말로
 * 자연스럽게 옮긴 것이라 언어 사이의 차이는 말투가 아니라 판정기 탓으로 볼 수 있다.
 *
 * `champions` 는 문장에 나온 챔피언 id 다. 이름 찾기(`detectChampions`)는 이 평가의
 * 대상이 아니므로 정답을 준다. 판정기는 그 이름 목록을 받고 갈래만 가린다.
 * `mine` 은 matchup 일 때 사용자가 잡은 쪽이다.
 */
import type { AskKind } from "../../../src/lib/advisor/routeAsk";

export type RouteLang = "ko_KR" | "en_US" | "zh_CN";

export interface RouteCase {
  lang: RouteLang;
  question: string;
  kind: AskKind;
  champions: string[];
  mine?: string;
}

type Row = [AskKind, string[], string | undefined, string, string, string];

/** [갈래, 챔피언, 내 챔피언, 한국어, 영어, 중국어] */
const ROWS: Row[] = [
  ["matchup", ["MonkeyKing", "Rumble"], "MonkeyKing", "오공으로 럼블 상대 어떻게 해?", "How do I play Wukong into Rumble?", "我用齐天大圣打机械公敌怎么打?"],
  ["matchup", ["Rumble", "MonkeyKing"], "MonkeyKing", "럼블 상대로 오공 하는데 너무 어려워", "Rumble is so hard to lane against when I'm on Wukong", "对面是机械公敌,我玩齐天大圣,好难打"],
  ["matchup", ["Yasuo", "Malphite"], "Yasuo", "야스오로 말파이트 만나면 라인전 어떻게 해?", "Laning as Yasuo vs Malphite, any tips?", "我玩疾风剑豪,对线熔岩巨兽怎么打?"],
  ["matchup", ["Fiora", "Aatrox"], "Fiora", "피오라 vs 아트록스 탑에서 누가 유리해? 내가 피오라야", "Fiora vs Aatrox top, who wins? I'm on Fiora.", "无双剑姬对暗裔剑魔上路谁优势?我是无双剑姬"],
  ["matchup", ["Zed", "Ahri"], "Ahri", "상대가 제드인데 나 아리야. 어떻게 버텨?", "Enemy mid is Zed and I'm Ahri, how do I survive?", "对面是影流之主,我玩九尾妖狐,怎么活下来?"],
  ["matchup", ["Garen", "Darius"], "Garen", "가렌으로 다리우스 이길 수 있어?", "Can I beat Darius as Garen?", "我玩德玛西亚之力能打过诺克萨斯之手吗?"],

  ["guide", ["Rumble"], undefined, "럼블 상대법 알려줘", "How do I beat Rumble?", "怎么对付机械公敌?"],
  ["guide", ["Teemo"], undefined, "티모 너무 짜증나는데 어떻게 잡아?", "Teemo is so annoying, how do I deal with him?", "迅捷斥候太烦了,怎么抓他?"],
  ["guide", ["Zed"], undefined, "제드 카운터 치는 법", "How do I counter Zed?", "怎么克制影流之主?"],
  ["guide", ["Blitzcrank"], undefined, "블리츠크랭크 그랩 어떻게 피해?", "How do I dodge Blitzcrank hooks?", "怎么躲蒸汽机器人的钩子?"],
  ["guide", ["Malphite"], undefined, "말파이트 만나면 뭘 조심해야 돼?", "What should I watch out for against Malphite?", "遇到熔岩巨兽要注意什么?"],
  ["guide", ["Vayne"], undefined, "베인 상대할 때 팁 좀", "Tips for laning against Vayne", "对线暗夜猎手有什么技巧?"],

  ["skills", ["Malphite"], undefined, "말파이트 스킬 설명해줘", "Explain Malphite's abilities", "介绍一下熔岩巨兽的技能"],
  ["skills", ["MonkeyKing"], undefined, "오공 스킬 구성이 어떻게 돼?", "What is Wukong's kit?", "齐天大圣的技能组成是什么?"],
  ["skills", ["Thresh"], undefined, "쓰레쉬는 어떤 스킬들을 가지고 있어?", "What abilities does Thresh have?", "魂锁典狱长有哪些技能?"],
  ["skills", ["LeeSin"], undefined, "리 신 스킬셋 정리해줘", "Give me a rundown of Lee Sin's skills", "盲僧的技能介绍一下"],
  ["skills", ["Nasus"], undefined, "나서스 기술 뭐뭐 있어?", "What skills does Nasus have?", "沙漠死神有什么技能?"],
  ["skills", ["Sett"], undefined, "세트 킷 알려줘", "Tell me about Sett's kit", "讲讲腕豪的技能"],

  ["spellStat", ["Garen"], undefined, "가렌 Q 쿨타임 몇 초야?", "What's Garen Q cooldown?", "德玛西亚之力Q冷却时间多少秒?"],
  ["spellStat", ["Zed"], undefined, "제드 R 계수가 어떻게 돼?", "What's the AD ratio on Zed R?", "影流之主R的加成系数是多少?"],
  ["spellStat", ["Lux"], undefined, "럭스 E 마나 얼마 들어?", "How much mana does Lux E cost?", "光辉女郎E耗蓝多少?"],
  ["spellStat", ["Caitlyn"], undefined, "케이틀린 Q 사거리 몇이야?", "What's the range on Caitlyn Q?", "皮城女警Q射程多少?"],
  ["spellStat", ["Ahri"], undefined, "아리 궁 쿨 몇이야?", "Ahri ult cooldown?", "九尾妖狐大招冷却多少?"],
  ["spellStat", ["Rumble"], undefined, "럼블 E 피해량 얼마야?", "How much damage does Rumble E do?", "机械公敌E伤害多少?"],

  ["other", [], undefined, "정복자 룬은 언제 들어?", "When should I take Conqueror?", "征服者符文什么时候带?"],
  ["other", [], undefined, "쇼진의 창 효과가 뭐야?", "What does Spear of Shojin do?", "朔极之矛有什么效果?"],
  ["other", [], undefined, "점멸 쿨타임 몇 초야?", "What's the cooldown on Flash?", "闪现冷却多少秒?"],
  ["other", [], undefined, "바론 몇 분에 나와?", "When does Baron spawn?", "大龙几分钟刷新?"],
  ["other", [], undefined, "안녕 반가워", "hi there", "你好"],
  ["other", [], undefined, "치유 감소 아이템 뭐 있어?", "Which items apply Grievous Wounds?", "哪些装备有重伤效果?"],
];

/**
 * 시험 문항. **판정기를 고치는 동안 보지 않는다.**
 *
 * 위 조정 문항으로 기준 문구·학습 자료를 다듬고, 다 고친 뒤 여기서 한 번 잰다.
 * 챔피언·말투·물건 이름을 조정 문항과 겹치지 않게 골랐다.
 */
const TEST_ROWS: Row[] = [
  ["matchup", ["Darius", "Sett"], "Darius", "다리우스로 세트 만나면 누가 이겨?", "Playing Darius into Sett, who wins lane?", "我玩诺克萨斯之手对腕豪谁赢?"],
  ["matchup", ["Caitlyn", "Vayne"], "Vayne", "케이틀린이 상대면 베인으로 어떻게 버텨?", "Caitlyn is the enemy ADC and I'm on Vayne, how do I survive lane?", "对面皮城女警,我玩暗夜猎手怎么撑过对线?"],
  ["matchup", ["Jax", "Teemo"], "Jax", "잭스 잡고 티모 라인전 팁", "I'm Jax against Teemo, laning tips?", "我用武器大师对线迅捷斥候有什么技巧?"],
  ["matchup", ["Lux", "Zed"], "Lux", "럭스로 제드 상대하는데 뭐부터 조심해?", "As Lux vs Zed, what should I watch first?", "我玩光辉女郎对影流之主要先注意什么?"],

  ["guide", ["Darius"], undefined, "다리우스 공략 좀", "How do I play against Darius?", "诺克萨斯之手怎么打?"],
  ["guide", ["Yasuo"], undefined, "야스오 바람장막 어떻게 대처해?", "How do I play around Yasuo's Wind Wall?", "怎么应对疾风剑豪的风墙?"],
  ["guide", ["Fiora"], undefined, "피오라한테 자꾸 지는데 어떻게 해야 돼?", "I keep losing to Fiora, what am I doing wrong?", "老是被无双剑姬打爆,该怎么办?"],
  ["guide", ["Thresh"], undefined, "쓰레쉬 사형 선고 맞으면 어떻게 해?", "What do I do when Thresh lands a hook on me?", "被魂锁典狱长钩中了怎么办?"],

  ["skills", ["Darius"], undefined, "다리우스 스킬들 알려줘", "What does Darius do? List his abilities", "诺克萨斯之手的技能都有什么?"],
  ["skills", ["Yasuo"], undefined, "야스오 기술 어떻게 구성돼 있어?", "Break down Yasuo's kit for me", "疾风剑豪技能介绍"],
  ["skills", ["Blitzcrank"], undefined, "블리츠크랭크 스킬 정리 부탁해", "Summarize Blitzcrank's abilities", "蒸汽机器人技能是什么?"],
  ["skills", ["Aatrox"], undefined, "아트록스는 무슨 스킬 써?", "What are Aatrox's skills?", "暗裔剑魔有哪些技能?"],

  ["spellStat", ["Darius"], undefined, "다리우스 E 쿨 몇 초?", "Darius E cooldown?", "诺克萨斯之手E冷却几秒?"],
  ["spellStat", ["Thresh"], undefined, "쓰레쉬 Q 사거리 얼마야?", "How far does Thresh Q reach?", "魂锁典狱长Q距离多远?"],
  ["spellStat", ["Nasus"], undefined, "나서스 W 마나 소모량", "Nasus W mana cost", "沙漠死神W耗蓝"],
  ["spellStat", ["Teemo"], undefined, "티모 R 주문력 계수 몇 퍼야?", "What's the AP ratio on Teemo R?", "迅捷斥候R的法强加成是多少?"],

  ["other", [], undefined, "점화랑 순간이동 중에 뭐 들어?", "Should I take Ignite or Teleport?", "带点燃还是传送?"],
  ["other", [], undefined, "용은 몇 분에 처음 나와?", "When does the first dragon spawn?", "第一条小龙几分钟刷新?"],
  ["other", [], undefined, "마법 관통력 아이템 추천해줘", "Recommend magic penetration items", "推荐法术穿透装备"],
  ["other", [], undefined, "고마워!", "thanks!", "谢谢!"],
];

const expand = (rows: Row[]): RouteCase[] =>
  rows.flatMap(([kind, champions, mine, ko, en, zh]) =>
    (
      [
        ["ko_KR", ko],
        ["en_US", en],
        ["zh_CN", zh],
      ] as const
    ).map(([lang, question]) => ({ lang, question, kind, champions, mine })),
  );

export const ROUTE_CASES: RouteCase[] = expand(ROWS);
export const ROUTE_TEST: RouteCase[] = expand(TEST_ROWS);
