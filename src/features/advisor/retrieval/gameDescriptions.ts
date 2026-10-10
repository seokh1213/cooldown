interface Description { id: string; groups: RegExp[] }

// 별칭이 없는 설명을 기존 사실 항목에 연결한다. 등장 시각은 원문 값으로 답한다.
const DESCRIPTIONS: Description[] = [
  { id: "voidgrubs", groups: [/바론|baron/i, /벌레|유충|bugs|grubs/i] },
  { id: "herald", groups: [/바론|baron/i, /15\s*(?:분|minute|分钟)|at 15/i] },
  { id: "elder", groups: [/영혼|soul|龙魂/i, /이후|뒤|after|以后|后/i, /리젠|재생성|respawn|刷新/i] },
  { id: "minion-waves", groups: [/미니언|쫄|creeps|minions|兵/i, /한\s*(?:무리|웨이브)|생성|spawn|new set|出一波|一波兵/i] },
  { id: "dodge", groups: [/선택창|챔.*선택|champ select|选英雄|选人/i, /나가|퇴장|leave|退出来|退出/i] },
  { id: "mute", groups: [/핑|채팅|pings|chat|信号|聊天/i, /차단|막는|막|block|屏蔽|不显示/i] },
  { id: "ping-limit", groups: [/핑|물음표|pings|question marks|信号|问号/i, /제한|몇\s*번|연타|막혔|limit|spam|how many|最多|次数|发不了了/i] },
  { id: "cs", groups: [/정글|jungle|野怪/i, /점수|몇\s*(?:개|점)|points|farm|刀/i] },
  { id: "plating", groups: [/포탑|타워|tower|turret|塔/i, /판|방패|plating|layers|镀层|金币/i] },
];

export function describedGameFact(question: string): string | undefined {
  return DESCRIPTIONS.find(entry => entry.groups.every(group => group.test(question)))?.id;
}

export function describesChampionRespawn(question: string): boolean {
  return /챔피언|내가|죽으면|부활\s*시간|death|(?:i|my champion).*dead|(?:级|英雄).*死|黑屏/i.test(question);
}
