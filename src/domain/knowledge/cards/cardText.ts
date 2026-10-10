import type { CardTextOptions, ChampionCard, StatName } from "./contracts";
import { round } from "../text/text";

// ---------------------------------------------------------------------------
// 카드 → 프롬프트용 평문
// ---------------------------------------------------------------------------
const STAT_LABEL: Record<StatName, string> = {
  health: "체력",
  armor: "방어력",
  magicResist: "마법 저항력",
  attackDamage: "공격력",
  attackSpeed: "공격 속도",
  moveSpeed: "이동 속도",
  healthRegen: "체력 재생",
};

export function championCardToText(card: ChampionCard, opts: CardTextOptions = {}): string {
  const {
    includeSpellText = true,
    spellTextMax = 420,
    spellDetail = includeSpellText ? "full" : "summary",
  } = opts;
  const lines: string[] = [];
  const classLine = card.wiki
    ? `${card.wiki.heroType ?? "?"}${card.wiki.altType ? `/${card.wiki.altType}` : ""}${card.wiki.subclass ? ` · ${card.wiki.subclass}` : ""}`
    : card.roleTags.join("/") || "미상";
  lines.push(
    `${card.name}${card.title ? ` (${card.title})` : ""} — 클래스: ${classLine}, ${card.rangeType}(사거리 ${card.attackRange}), 자원: ${card.resource ?? "없음"}${card.wiki?.positions.length ? `, 주 포지션: ${card.wiki.positions.join("/")}` : ""}`,
  );
  if (card.riot?.tagPrimary) {
    lines.push(
      `라이엇 특성: ${card.riot.tagPrimary}${card.riot.tagSecondary ? `, ${card.riot.tagSecondary}` : ""}${card.riot.playstyle ? ` (피해 ${card.riot.playstyle.damage}, 내구도 ${card.riot.playstyle.durability}, 군중 제어 ${card.riot.playstyle.crowdControl}, 기동력 ${card.riot.playstyle.mobility}, 유틸 ${card.riot.playstyle.utility} — 각 0~3)` : ""}`,
    );
  }
  // 피해 유형은 라이엇 분류를 우선한다. 툴팁 집계는 참고 수치로만 남긴다.
  lines.push(
    card.riot?.damageType
      ? `주 피해 유형: ${card.riot.damageType} (라이엇 분류; 툴팁 집계는 물리 스킬 ${card.damageProfile.physical}, 마법 스킬 ${card.damageProfile.magical}, 고정 ${card.damageProfile.trueDamage})`
      : `주 피해 유형: ${card.damageProfile.primary} (물리 스킬 ${card.damageProfile.physical}, 마법 스킬 ${card.damageProfile.magical}, 고정 ${card.damageProfile.trueDamage})`,
  );
  const sp = card.scalingProfile;
  lines.push(
    `계수 프로필: ${sp.primary} (주문력 계수 스킬 ${sp.apSpells}, 공격력 계수 스킬 ${sp.adSpells}, 체력 계수 스킬 ${sp.healthSpells})`,
  );
  const statOrder: StatName[] = ["health", "armor", "magicResist", "attackDamage", "moveSpeed"];
  for (const stat of statOrder) {
    const s = card.stats[stat];
    const rank =
      s.percentileLv1 < 50
        ? `하위 ${Math.max(1, round(s.percentileLv1, 0))}%`
        : `상위 ${Math.max(1, round(100 - s.percentileLv1, 0))}%`;
    lines.push(
      `- ${STAT_LABEL[stat]}: 1레벨 ${s.lv1} [${s.gradeLv1}, 전체 챔피언 중 ${rank}] → 18레벨 ${s.lv18} [${s.gradeLv18}]`,
    );
  }
  if (card.mechanics.length) lines.push(`보유 효과: ${card.mechanics.join(", ")}`);
  lines.push("스킬:");
  for (const sp of card.spells) {
    const meta: string[] = [];
    if (sp.recharge) meta.push(`재충전 ${sp.recharge}초${sp.maxCharges ? ` (${sp.maxCharges}회 충전)` : ""}`);
    else if (sp.cooldown) meta.push(`쿨 ${sp.cooldown}초`);
    if (sp.cost && sp.cost !== "0") meta.push(`비용 ${sp.cost}`);
    if (sp.damageTypes.length) meta.push(`${sp.damageTypes.join("+")} 피해`);
    const ratioText = Object.entries(sp.ratios)
      .map(([stat, v]) => `${stat} ${v}%`)
      .join(", ");
    if (ratioText) meta.push(`계수: ${ratioText}`);
    if (sp.effects.length) meta.push(`효과: ${sp.effects.join(", ")}`);
    lines.push(`- ${sp.slot} ${sp.name}${meta.length ? ` (${meta.join("; ")})` : ""}`);
    if (spellDetail === "meta") continue;
    const summaryIsBody = !!sp.summary && sp.summary === sp.text;
    if (sp.summary && !summaryIsBody) lines.push(`  요약: ${sp.summary}`);
    if ((spellDetail === "full" || summaryIsBody) && sp.text) {
      const body = sp.text.length > spellTextMax ? `${sp.text.slice(0, spellTextMax)}…` : sp.text;
      lines.push(`  상세: ${body}`);
    }
  }
  // 공식 allytips/enemytips 는 정적 데이터에서 제거되었으므로 지식 계층(dev/data/knowledge/)이 대신한다
  return lines.join("\n");
}
