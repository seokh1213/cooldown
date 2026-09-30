/**
 * 질문이 무엇을 묻는지 낱말로 가른다 — 판정기(kev 헤드)가 없는 기기의 길
 *
 * 갈래(`AskKind`)는 `understand` 가 한 번만 정한다: 판정기가 있으면 판정기, 없으면 `askFromWords`. 단계들은 그 갈래 하나를
 * 읽지 갈래를 따로 가르지 않는다. 예전에는 단계마다 제 낱말 목록으로 "내 질문인가" 를 정해, 판정기를 보는 단계와 안 보는
 * 단계가 섞였다 — 상성 이어 묻기는 판정기를 안 봐서 "두 챔피언에 대해 스킬 쿨타임도 알려줘" 가 표 대신 해설로 나갔다.
 *
 * 여기 남은 낱말 목록은 두 몫이다. 하나는 `askFromWords` 의 재료(갈래), 다른 하나는 갈래가 아닌 것 — 둘을 견주는가(`asksComparison`),
 * 화면·대화의 챔피언을 가리키는가(`refersToContextChampions`), 스킬 전체인가(`asksWholeKit`) — 를 가르는 규칙이다.
 */
import type { RuleSubject } from "@/lib/knowledge/rules";
import type { AskKind } from "./routeAsk";
import { isSmallTalk } from "./intent";
import { asksSpellNumbers } from "./spellFocus";

/** 둘 이상을 견주는 질문인가. "누가 더 높아", "어느 쪽이", "비교", "중에", "두 챔피언", "둘 다". */
const COMPARISON =
  /더\s*(높|많|센|강|단단|긴|짧|빠|느|좋)|누가|어느\s*쪽|비교|중에|두\s*챔피언|둘\s*다|양쪽|\bboth\b|两个|\bvs\b|\b(who|which)\b|\b(more|higher|better|stronger|tankier|longer|shorter|faster|slower)\b|\bcompare\b|谁|哪个|比较|更(高|多|强|快|好)/i;

export function asksComparison(question: string, championCount: number): boolean {
  return championCount >= 2 && COMPARISON.test(question);
}

/**
 * 상성을 묻는가. "제이스랑 상대한다 생각하면", "럼블 만나면 어떻게 해?".
 * 대화에서 방금 다룬 챔피언이 있으면 그가 내 챔피언, 새로 나온 이름이 상대다.
 */
const MATCHUP =
  /상대|맞상대|맞붙|라인전|만나면|만났을|만날\s*때|카운터|어떻게\s*(해야|하지|해\b|되|풀)|이길|이겨|이기|싸우|붙으면|붙었|유리|불리|\bvs\b|\b(against|into|counter|matchup|lane)\b|\bbeat\b|对线|对位|克制|怎么打|打得过/i;

export function asksMatchup(question: string): boolean {
  return MATCHUP.test(question);
}

/**
 * "말파이트 상대법" 처럼 **한 챔피언의 공략을 통째로** 묻는가.
 *
 * `asksMatchup` 은 "상대" 만 보고 참이 되므로 이것까지 상성으로 끌고 갔다. 앞 대화에
 * 오공이 있었다는 이유로 "말파이트 상대법" 이 "오공 vs 말파이트" 가 됐다. 사용자는
 * 내 챔피언을 말한 적이 없다.
 *
 * 가르는 것은 **명사인가 서술인가** 다. "만나면", "붙으면", "어떻게 해" 는 마주친
 * 상황을 말하므로 상대가 누구인지 맥락이 채워 주는 것이 맞다. "상대법" 은 그 챔피언
 * 자체의 공략을 달라는 말이라 짝지을 상대가 없다.
 */
const GUIDE_ASK =
  /(상대|공략|카운터|대처|파훼)\s*법|(상대|공략)\s*하는\s*법|how\s+(do\s+i|to)\s+(beat|counter|deal\s+with|play\s+against)|怎么(打|对付|应对)|如何(打|对付|应对)/i;

export function asksGuide(question: string): boolean {
  return GUIDE_ASK.test(question);
}

/** 스킬 전체를 설명해 달라는가. "스킬 설명해줘", "스킬 뭐 있어", "스킬 알려줘". */
const SKILLS_OVERVIEW =
  /스킬\s*(셋|세트|구성|킷)|스킬(들|은|이|도)?\s*(설명|알려|소개|정리|뭐|무엇|어떤|있|어떻)|\b(abilities|kit|skill\s*set)\b|explain\s+\w+'?s?\s*(abilities|kit|skills)|技能(介绍|构成|组成)|介绍.{0,6}技能/i;

export function asksSkillsOverview(question: string): boolean {
  return SKILLS_OVERVIEW.test(question);
}

/**
 * 스킬 여럿을 한꺼번에 묻는가. "패시브와 네 가지 스킬을 각각", "패시브랑 QWER 전체", "passive q w e r".
 *
 * 슬롯 낱말("패시브")이 하나 보이면 그 스킬 카드로 갔는데, 이런 질문은 스킬 전체 소개가 답이다.
 * 슬롯이 둘 이상 나오거나 "각각·전체·모든 스킬·네 가지" 를 말하면 전체로 본다.
 */
export function asksWholeKit(question: string): boolean {
  if (/네\s*가지|4\s*가지|각각|전체|모든\s*스킬|스킬\s*다|QWER|all (abilities|skills|spells)|each (ability|skill)|every (ability|skill)|全部技能|每个技能|所有技能|各个技能/i.test(question)) return true;
  const slots = new Set<string>();
  if (/패시브|passive|被动/i.test(question)) slots.add("P");
  for (const m of question.matchAll(/(?<![A-Za-z])([QWERqwer])(?![A-Za-z])/g)) slots.add(m[1].toUpperCase());
  return slots.size >= 2;
}

/**
 * 게임 규칙·메타 낱말. 챔피언 가격·항복·다시하기·랭크·스킨 … 판정기의 game 갈래와 같은 영역이다.
 * 갈래 낱말 규칙(`askFromWords`)의 재료이고, 상성 대화에서는 앞 상성과 상관없는 새 질문의 표지다(`actFromWords`).
 */
const GAME_WORDS =
  /항복|서렌|조기 항복|닷지|다시하기|리메이크|승점|\bLP\b|승급|티어|듀오|정수|RP|챔피언 가격|챔프 가격|가격 얼마|스킨|환불|몇 분에 나와|몇 분부터|등장 시간|젠 시간|리젠|\bsurrender\b|\bff\b|\bremake\b|\bdodg|\branked\b|\bpromos?\b|blue essence|\bBE\b|\bskins?\b|\bspawns?\b|respawn|投降|重开|秒退|胜点|排位|蓝色精粹|精粹|皮肤|退款|刷新|几分钟/i;

export function asksGameMeta(question: string): boolean {
  return GAME_WORDS.test(question);
}

/**
 * 챔피언을 겨냥한 질문으로 보이는가. 이름은 없지만 "W 쿨타임", "설명해줘", "스킬 계수" 처럼
 * 챔피언이 있어야 답이 되는 질문. 대화·화면 맥락의 챔피언을 붙여도 되는지 가른다.
 * "쇼진의 창 효과" 는 여기 걸리면 안 되므로 아이템·규칙 판정 뒤에 쓴다.
 */
// 모델 없는 기기용 예비 규칙. 영어·중국어 조회는 판정기(spellStat·skills 갈래)가 맡고 여기는 최소한만 둔다.
// "그럼 템은?" 처럼 아이템 이름 없이 템만 물으면 대화의 챔피언 아이템 노트가 답이다(2026-09-30 브라우저 시험: "자료 없음" 으로 빠짐).
const CHAMPION_DIRECTED =
  /설명|스킬|능력치|스탯|상대|어때|어떤|세[?요]?$|강해|약해|쿨|계수|사거리|체력|방어|마저|이속|공격력|아이템|(?<!시스|아이)템(은|는|이|을|트리|\s|$)|빌드|cooldown|\bcd\b|\bmana\b|ratio|\brange\b|abilit|\bskills?\b|\bbuild\b|\bitems?\b|冷却|技能|耗蓝|加成|射程|出装|装备/i;

/** 화면·대화의 챔피언을 가리키는 말. "두 챔피언", "둘 다", "이 챔피언". 이름이 없어도 검색 문서가 아니라 그 챔피언이 답이다. */
const CONTEXT_CHAMPIONS = /두\s*챔피언|둘\s*다|이\s*둘|양쪽|이\s*챔(피언|프)|\bboth\b|these\s+two|this\s+champ|两个英雄|这个英雄/i;

export function refersToContextChampions(question: string): boolean {
  return CONTEXT_CHAMPIONS.test(question);
}

/** 갈래가 스킬 소개·스킬 수치면 이름이 없어도 챔피언 질문이다. 판정기가 가른 영어·중국어 질문이 한국어 낱말 없이도 여기 든다. */
export function looksChampionDirected(question: string, slot?: string, ask?: AskKind): boolean {
  return Boolean(slot) || ask === "spellStat" || ask === "skills" || CHAMPION_DIRECTED.test(question);
}

/** 질문에서 찾은 이름. 낱말이 아니라 자료가 가르는 것이라 부르는 쪽(`understand`)이 찾아 넘긴다. */
export interface AskHints {
  /** 질문에 적힌 챔피언 수 */
  champions: number;
  /** 질문에 적힌 룬·주문·게임 요소 규칙의 갈래(`askedRules`). 여럿이면 첫 것 */
  rule?: RuleSubject;
  /** 아이템 이름이 걸렸다(`buildItemCard`) */
  item?: boolean;
  /** 게임 메타 사실이 걸렸다(`gameMetaAnswer`) */
  game?: boolean;
}

/**
 * 판정기 없이 낱말로 갈래를 가른다. 판정기와 같은 아홉 칸을 낸다(`AskKind`).
 *
 * 순서가 곧 우선순위다. 예전 단계 순서(룬·주문 → 게임 메타 → 상성 → 아이템 → 챔피언)를 그대로 옮겼는데, 이름이 있고 없고에 따라
 * 앞뒤가 다르다 — 이름이 없으면 자료 이름(룬·주문·아이템·게임 메타)이 먼저고, 이름이 있으면 챔피언 갈래가 먼저다.
 * "가렌으로 다리우스 상대할 때 태양불꽃 가도 돼?" 는 아이템이 아니라 상성이고, "쇼진의 창 쿨타임" 은 스킬 수치가 아니라 아이템이다.
 *
 * 상성은 판정기처럼 이름이 둘이어야 한다(`routeFromKind9`). 이름 하나에 상성 낱말("제이스랑 상대한다 생각하면")은 앞 대화의 챔피언이
 * 내 챔피언이 되는 상성이라 그대로 상성으로 두고, "말파이트 상대법" 처럼 공략을 통째로 달라는 말은 공략이다(`asksGuide`).
 * 이름이 없는 상성·공략 낱말은 공략으로 본다 — 짝지을 이름이 없다.
 *
 * 한국어 낱말이 대부분이라 영어·중국어에는 약하다(세 언어 재 보니 한국어 5/6, 영어 1/6, 중국어 1/6). 그래서 판정기가 먼저고
 * 이것은 모델을 안 받은 기기의 길이다. 목록을 지우지 않는 까닭이다.
 */
export function askFromWords(question: string, found: AskHints): AskKind {
  if (isSmallTalk(question)) return "chat";
  const entity = entityKind(found);
  const champion = championKind(question, found.champions);
  return (found.champions > 0 ? (champion ?? entity) : (entity ?? champion)) ?? (asksGameMeta(question) ? "game" : "other");
}

/** 자료 이름이 가리키는 갈래. 룬·주문 규칙 → 아이템 → 게임 메타 */
function entityKind(found: AskHints): AskKind | undefined {
  if (found.rule === "rune") return "rune";
  if (found.rule === "summoner") return "spell";
  if (found.rule === "gameplay") return "game";
  if (found.item) return "item";
  if (found.game) return "game";
  return undefined;
}

/**
 * 챔피언 갈래. 상성·공략 → 스킬 소개 → 스킬 수치. 스킬 소개가 수치보다 앞인 것은 "스킬 설명해줘" 가 쿨타임 표가 아니어서다.
 * 이름이 없을 때만 수치가 맨 앞이다 — 상성 대화 중 "라인전에서 Q 쿨타임 얼마야" 는 해설이 아니라 표다("때·언제" 는 `asksSpellNumbers` 가 뺀다).
 */
function championKind(question: string, champions: number): AskKind | undefined {
  if (champions === 0 && asksSpellNumbers(question)) return "spellStat";
  if (champions >= 2 && asksMatchup(question)) return "matchup";
  if (champions === 1 && asksGuide(question)) return "guide";
  if (champions === 1 && asksMatchup(question)) return "matchup";
  if (champions === 0 && (asksGuide(question) || asksMatchup(question))) return "guide";
  if (asksSkillsOverview(question)) return "skills";
  if (asksSpellNumbers(question)) return "spellStat";
  return undefined;
}
