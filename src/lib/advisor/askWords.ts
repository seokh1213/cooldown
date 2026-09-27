/** 둘 이상을 견주는 질문인가. "누가 더 높아", "어느 쪽이", "비교", "중에". */
const COMPARISON =
  /더\s*(높|많|센|강|단단|긴|짧|빠|느|좋)|누가|어느\s*쪽|비교|중에|\bvs\b|\b(who|which)\b|\b(more|higher|better|stronger|tankier|longer|shorter|faster|slower)\b|\bcompare\b|谁|哪个|比较|更(高|多|强|快|好)/i;

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
 * 챔피언을 겨냥한 질문으로 보이는가. 이름은 없지만 "W 쿨타임", "설명해줘", "스킬 계수" 처럼
 * 챔피언이 있어야 답이 되는 질문. 대화·화면 맥락의 챔피언을 붙여도 되는지 가른다.
 * "쇼진의 창 효과" 는 여기 걸리면 안 되므로 아이템·규칙 판정 뒤에 쓴다.
 */
const CHAMPION_DIRECTED = /설명|스킬|능력치|스탯|상대|어때|어떤|세[?요]?$|강해|약해|쿨|계수|사거리|체력|방어|마저|이속|공격력/;

export function looksChampionDirected(question: string, slot?: string): boolean {
  return Boolean(slot) || CHAMPION_DIRECTED.test(question);
}
