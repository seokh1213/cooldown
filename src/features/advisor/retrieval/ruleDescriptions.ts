import type { AdvisorData } from "./context";
import { askedRuleKinds } from "@/domain/knowledge/notes/rules";

interface Description { name: string; groups: RegExp[]; historical?: boolean }

// 검색 표현만 연결한다. 수치·예외 판정은 선택된 규칙과 현재 툴팁에서 읽는다.
const RUNES: Description[] = [
  { name: "감전", groups: [/세\s*(?:번|대)|3.?hit|3\s*(?:회|번|타)|third hit|三下/i, /폭발|폭딜|burst|爆发/i] },
  { name: "어둠의 수확", groups: [/반피|딸피|피.*적|low (?:hp|health)|残血|生命值低/i, /스택|점점|수확|stronger|soul|harvest|叠|灵魂/i] },
  { name: "칼날비", groups: [/세\s*(?:번|대)|3\s*(?:회|번|타|autos)|first 3|前三/i, /공속|공격\s*속도|fast|attack speed|攻速/i] },
  { name: "비열한 한 방", groups: [/고정\s*피해|true damage|真实伤害/i, /cc|군중|이동.*방해|느리|slow|impaired|控/i] },
  { name: "돌발 일격", groups: [/돌진|이동기|대시|dash|blink|leap|位移/i, /은신|stealth|隐身/i] },
  { name: "섬뜩한 기념품", groups: [/기념품|트로피|troph|memento|纪念品/i, /가속|haste|急速/i] },
  { name: "궁극의 사냥꾼", groups: [/궁|ultimate|大招/i, /쿨|가속|줄여|cooldown|haste|冷却/i] },
  { name: "봉인 풀린 주문서", groups: [/소환사|스펠|summoner|召唤师/i, /교체|교환|갈아|swap|switch|换/i] },
  { name: "마법공학 점멸기", groups: [/점멸|flash|闪现/i, /채널|충전|시전|정신\s*집중|channel|读条/i] },
  { name: "선제공격", groups: [/먼저|선제|first|先手/i, /골드|돈|gold|金币/i] },
  { name: "시간 왜곡 물약", groups: [/물약|포션|potion|药水|喝药/i, /즉시|바로|instant|立刻/i] },
  { name: "쾌속 접근", groups: [/향해|향하여|접근|toward|朝/i, /방해|둔화|cc|impaired|slow|控/i, /속도|이속|speed|加速/i] },
  { name: "집중 공격", groups: [/평타|기본\s*공격|평\s*세|autos|basic attacks|平a|普攻/i, /세\s*(?:번|대)|3|three|三下/i, /피해.*늘|증폭|받는\s*피해|damage|伤害/i] },
  { name: "기민한 발놀림", groups: [/평타|평\s*타|attack|auto|平a|普攻/i, /회복|힐|heal|回血/i, /이속|속도|speed|加速/i] },
  { name: "침착", groups: [/킬\s*관여|처치.*관여|takedown|参与击杀/i, /자원|마나|기력|mana|energy|法力|能量/i] },
  { name: "승전보", groups: [/킬\s*관여|처치.*관여|takedown|参与击杀/i, /피\s*채워|회복|heal|回血/i] },
  { name: "최후의 일격", groups: [/피.*적은\s*적|상대.*체력|low.*(?:enemies|enemy)|残血敌人/i, /피해|딜|damage|增伤/i] },
  { name: "최후의 저항", groups: [/내\s*피|내\s*체력|you.*low|your.*low|自己.*血/i, /피해|딜|damage|伤害/i] },
  { name: "여진", groups: [/속박|기절|군중|cc|locking|immobili|控/i, /방어|마저|armor|resist|双抗/i, /이후|뒤|나면|after|然后|后/i] },
  { name: "소생", groups: [/힐|치유|회복|heal|治疗/i, /실드|보호막|shield|护盾/i, /효율|증가|올려|boost|increase|提高/i] },
  { name: "콩콩이 소환", groups: [/정령|요정|sprite|精灵/i, /보호막|실드|shield|盾/i] },
  { name: "수호자", groups: [/아군|팀원|ally|allies|队友/i, /보호막|실드|shield|护盾/i] },
  { name: "철거", groups: [/포탑|타워|turret|tower|塔/i, /충전|차징|charge|蓄力/i] },
  { name: "생명의 샘", groups: [/둔화|느리|slow|减速/i, /아군|팀원|allies|ally|队友/i, /회복|heal|回血/i] },
  { name: "뼈 방패", groups: [/맞으면|맞은|damages you|被.*打/i, /피해.*줄|피해.*감소|reduce|减免|减伤/i] },
  { name: "불굴의 의지", groups: [/cc|군중|제어|控/i, /방어력|마저|resist|双抗/i] },
  { name: "신비로운 유성", groups: [/운석|혜성|유성|space rock|comet|陨石/i, /스킬|ability|skill|技能/i] },
  { name: "빛의 망토", groups: [/스펠|소환사|summoner|召唤师/i, /이속|속도|speed|移速/i] },
  { name: "주문 작열", groups: [/스킬|ability|skill|技能/i, /화상|불\s*도트|burn|灼烧|烧/i, /조금|작은|small|一下/i] },
  { name: "죽음불꽃 손길", groups: [/스킬|ability|skill|技能/i, /화상|불\s*도트|burn|灼烧/i] },
  { name: "물 위를 걷는 자", groups: [/강가|강\s*안|river|河道/i, /능력치|강화|buff|속도|speed|加成/i] },
];
const SUMMONERS: Description[] = [
  { name: "고양", historical: true, groups: [/공속|attack speed|攻速/i, /크기|커지|bigger|size|变大/i] },
  { name: "천리안", historical: true, groups: [/밝혀|시야|reveal|vision|视野/i, /곳|맵|map|area|地图/i] },
  { name: "구축", historical: true, groups: [/포탑|tower|turret|塔/i, /무적|invulnerab|无敌/i] },
  { name: "결집", historical: true, groups: [/깃발|토템|totem|flag|图腾/i, /아군|allies|ally|友军/i] },
  { name: "부활", historical: true, groups: [/되살|부활|respawn|revive|复活/i, /바로|즉시|instant|立刻/i] },
  { name: "진급", historical: true, groups: [/미니언|小兵|minion/i, /키워|강화|기병|super|siege|强化/i] },
  { name: "총명", groups: [/마나|mana|回蓝|法力/i, /회복|채워|restore|恢复|回蓝/i] },
  { name: "정화", groups: [/해제|풀어|cleanse|remove|解控/i, /cc|군중|제어|控制|解控/i] },
  { name: "회복", groups: [/나.*아군|자신.*아군|yourself.*ally|自己.*队友/i, /회복|heal|回血/i] },
  { name: "강타", groups: [/정글|jungler|打野/i, /충전|charge|充能/i] },
  { name: "유체화", groups: [/haste|speed|이속|속도/i, /summoner|소환사|스펠/i] },
];

export function describedRule(data: AdvisorData, question: string): string | undefined {
  const kinds = askedRuleKinds(question);
  const historical = /예전|옛날|삭제|과거|old|former|removed|historical|used to|以前|过去|旧|曾经/i.test(question);
  const descriptions = kinds.has("rune") ? RUNES : kinds.has("summoner") || historical || /\bspell\b/i.test(question)
    ? [...SUMMONERS, RUNES.find(d => d.name === "마법공학 점멸기")!] : RUNES.filter(d => d.name === "마법공학 점멸기");
  const candidates = descriptions.filter(d => (!d.historical || historical) && d.groups.every(group => group.test(question)))
    .filter(d => data.ruleIndex.has(d.name));
  const best = candidates.sort((a, b) => b.groups.length - a.groups.length)[0];
  return best ? `rule:${best.name}` : undefined;
}
