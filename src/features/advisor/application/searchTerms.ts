const CONCEPTS: Array<[string, RegExp]> = [
  ["healthregen", /체력\s*재생|health\s*regen(?:eration)?|生命\s*回复/gi],
  ["healshield", /(?:회복|치유|힐)\s*(?:및|과|·|\/|&)?\s*(?:보호막|실드)|heal(?:ing)?\s*(?:and|&)\s*shield(?:ing)?|治疗和护盾/gi],
  ["mitigation", /피해(?:를|량을)?\s*(?:줄|감소)|(?:reduce|reducing|reduced)\s*(?:incoming\s*)?damage|伤害减免|减免伤害/gi],
  ["basicattack", /평타|평a|평(?=\s)|기본\s*공격|\bauto(?:s|attack)?\b|basic attacks?|普攻|平a/gi],
  ["attackspeed", /공속|공격\s*속도|attack speed|攻速|攻击速度/gi],
  ["movementspeed", /이속|이동\s*속도|move(?:ment)? speed|移速|移动速度/gi],
  ["threehits", /3\s*(?:회|번|타)|세\s*(?:번|대)|three|3-hit|\b3\s+(?=spells|attacks|autos)|三(?:下|次)|前三/gi],
  ["shield", /실드|쉴드|보호막|shields?|护盾/gi],
  ["heal", /힐|회복|치유|피\s*채워|\bheal(?:s|ing)?\b|\brestore(?:s|d)?\b|回血|治疗|回复/gi],
  ["truedamage", /고정\s*피해|트루뎀|true damage|真(?:实伤害|伤)/gi],
  ["damage", /피해|딜|damage|伤害/gi],
  ["lowhealth", /반피|딸피|피\s*(?:적|낮)|(?:낮은|적은)\s*체력|체력이\s*\d+%보다\s*낮|잔혈|low (?:hp|health)|残血|生命值低/gi],
  ["missinghealth", /잃은\s*체력|missing (?:health|hp)|已损生命/gi],
  ["maxhealth", /최대\s*체력|maximum health|max (?:hp|health)|最大生命/gi],
  ["mana", /(?<!얼)마나|법력|mana|法力|回蓝/gi],
  ["crowdcontrol", /\bcc\b|군중\s*제어|이동\s*(?:또는\s*행동을?\s*)?(?:방해|불가)|기절|immobili[sz](?:e|ing|ed)|crowd control|controlled|定住|控(?:制|到|住)/gi],
  ["slow", /둔화|slow(?:s|ed|ing)?|减速/gi],
  ["dash", /돌진|도약|대시|대쉬|\bdash(?:es|ing)?\b|\bblink(?:s|ing)?\b|位移/gi],
  ["stealth", /은신|stealth|invisib(?:le|ility)|隐身/gi],
  ["takedown", /(?:챔피언\s*)?처치(?:하는\s*데\s*처음으로)?\s*관여|킬\s*관여|takedowns?|kill participation|参与击杀/gi],
  ["stack", /스택|중첩|쌓(?:는|이는|이면|여|이)|stack(?:s|ing)?|叠(?:加|层|满)?/gi],
  ["adaptive", /적응형|adaptive|自适应/gi],
  ["permanent", /영구|permanent(?:ly)?|永久/gi],
  ["cooldown", /쿨(?:타임)?|재사용\s*대기\s*시간|(?:스킬|소환사\s*주문)\s*가속|ability haste|skill haste|summoner(?: spell)? haste|cooldowns?|\bcd\b|冷却|技能急速/gi],
  ["ultimate", /궁극기|궁(?=\s|$|쿨)|\bult(?:imate)?s?\b|大招/gi],
  ["biscuit", /비스킷|\bbiscuits?\b|\bcookies?\b|饼干/gi],
  ["potion", /포션|물약|potions?|药水/gi],
  ["instant", /즉시|바로|instant(?:ly)?|immediate(?:ly)?|立刻|立即/gi],
  ["outofcombat", /비전투|전투\s*중이\s*아닐|전투에서\s*벗어(?:나|난|났)|out.of.combat|탈전|脱战/gi],
  ["refund", /환급|일부.*돌려|돌려받|\brefund|返(?:钱|现|还)/gi],
  ["legendary", /전설(?:급|템)?|legendary|传说/gi],
  ["swap", /갈아끼우|교환|교체|swap(?:s|ping)?|switch(?:es|ing)?|更换|替换/gi],
  ["souls", /영혼|souls?|灵魂/gi],
  ["river", /강에|강가|강\s*안|\briver\b|河道/gi],
  ["ward", /와드|wards?|眼位|插眼/gi],
  ["gold", /골드|돈|gold|金币/gi],
  ["burn", /화상|불\s*도트|burn(?:s|ing)?|灼烧/gi],
  ["turret", /포탑|타워|turrets?|towers?|防御塔/gi],
  ["nearby", /근처|주변|인근|nearby|附近/gi],
  ["ally", /아군|팀원|all(?:ied|y|ies)|友方|队友/gi],
  ["charge", /충전|차징|charg(?:e|ing)|蓄力/gi],
  ["protect", /지켜|지키|보호(?:하|해)|guard(?:ing)?|protect(?:ing)?|保护/gi],
  ["resistance", /방어력|마저|방어.*마법\s*저항|resistances?|armou?r|护甲|双抗/gi],
  ["rune", /룬|키스톤|runes?|keystone|符文|基石/gi],
  ["summoner", /스펠|소환사\s*주문|summoner spells?|召唤师技能/gi],
  ["domination", /지배|domination|主宰/gi],
  ["precision", /정밀|precision|精密/gi],
  ["resolve", /결의|resolve|坚决/gi],
  ["sorcery", /마법\s*룬|sorcery|巫术/gi],
  ["inspiration", /영감|inspiration|启迪/gi],
];
const STOP = new Set("the that this what which when where does did how why who with from for you your are was were can could should would and but not its into onto about after before still then than them they their there here have has had get got give gives just like also only very much many more most some any all each every one two is be been being do doing to of in on at by as or if so up out off my me mine i we us our 룬 어떤 그거 이거 그건 그거는 뭐야 있나 있어 경우 동안".split(" "));

/** 같은 효과를 다르게 부르는 세 언어를 검색 어휘로 통일한다. */
export function searchTerms(text: string): string[] {
  let normalized = text.toLowerCase().replace(/<[^>]*>/g, " ");
  for (const [index, [, pattern]] of CONCEPTS.entries()) normalized = normalized.replace(pattern, ` §${index}§ `);
  normalized = normalized.replace(/§(\d+)§/g, (_, index) => CONCEPTS[Number(index)][0]);
  const terms = normalized.match(/[a-z][a-z0-9]+|[가-힣]{2,}|[\u3400-\u9fff]{2,}|\d+/g) ?? [];
  const selected: string[] = [];
  for (const term of terms) {
    if (STOP.has(term)) continue;
    if (/^[\u3400-\u9fff]+$/.test(term)) {
      for (let i = 0; i < term.length - 1; i++) selected.push(term.slice(i, i + 2));
    } else selected.push(term.replace(/(?:에서|으로|에게|은|는|을|를|의|에|도|만)$/, ""));
  }
  return [...new Set(selected.filter(term => term.length >= 2))];
}
