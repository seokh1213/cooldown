import type { DataLocale } from "./localization";
import type { Champion } from "../../src/types";
import type { ChampionsByLocale } from "./champion-source";
import type { StaticDataSources } from "../../src/data/contracts/staticData";
import type { DroppedCalculation } from "../../src/lib/spellTooltipParser/types";

const ABILITY_SLOTS = ["Q", "W", "E", "R"] as const;

/** 값을 버린 계산식 자리 중 지금은 고칠 수 없어 기준선에 두는 것. 사유를 반드시 적는다. */
export interface AllowedDroppedCalculation {
  /** `<챔피언>:<슬롯>:<계산식 키>:<사유 코드>`. 변신 폼이면 슬롯 자리가 `Q/B` 꼴이다 */
  id: string;
  why: string;
}

export interface ActiveTooltipAllowlist {
  unresolvedTokens: string[];
  missingTooltips: string[];
  droppedCalculations?: AllowedDroppedCalculation[];
}

export interface DroppedCalculationIssue extends DroppedCalculation {
  /** 언어와 무관한 식별자 `<챔피언>:<슬롯>:<계산식 키>:<사유 코드>` (폼이면 슬롯 자리가 `Q/B`) */
  id: string;
  championId: string;
  locale: DataLocale;
  slot: "P" | (typeof ABILITY_SLOTS)[number];
  /** 변신 폼 툴팁이면 폼 키 */
  form?: "A" | "B";
  spellId: string;
}

export interface ActiveTooltipIssue {
  championId: string;
  locale: DataLocale;
  slot: (typeof ABILITY_SLOTS)[number];
  /** 변신 폼 툴팁이면 폼 키 */
  form?: "A" | "B";
  spellId: string;
  unresolvedTokens: string[];
}

export interface ActiveTooltipValidationReport {
  schemaVersion: 2;
  patchVersion: string;
  sources: StaticDataSources;
  totals: {
    abilities: number;
    localized: number;
    fallback: number;
    withDiagnostics: number;
    uniqueUnresolvedTokens: number;
    /** 값을 버린 계산식 자리 (언어별로 센다) */
    droppedCalculations: number;
  };
  issues: ActiveTooltipIssue[];
  /**
   * 계산식을 평가하다 값을 버린 자리 (합산 실패·배율 생략·해석 못 한 항).
   * 툴팁에는 남은 항만 적혀 겉보기엔 멀쩡하므로 따로 모아 기준선으로 막는다.
   */
  droppedCalculations: DroppedCalculationIssue[];
  unexpectedTokens: string[];
  unexpectedMissingTooltips: string[];
  unexpectedDroppedCalculations: string[];
  staleAllowedTokens: string[];
  staleAllowedMissingTooltips: string[];
  staleAllowedDroppedCalculations: string[];
}

interface ChampionLocaleEntry {
  championId: string;
  locale: DataLocale;
  champion: Champion;
}

export interface ActiveTooltipValidationInput {
  championsByLocale: ChampionsByLocale;
  patchVersion: string;
  sources: StaticDataSources;
  allowlist: ActiveTooltipAllowlist;
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function sortedChampionLocaleEntries(
  championsByLocale: ChampionsByLocale,
): ChampionLocaleEntry[] {
  return [...championsByLocale.entries()]
    .flatMap(([locale, champions]) =>
      [...champions.entries()].map(([championId, champion]) => ({
        championId,
        locale,
        champion,
      })),
    )
    .sort(
      (left, right) =>
        compareStrings(left.championId, right.championId) ||
        compareStrings(left.locale, right.locale),
    );
}

export function validateActiveTooltips({
  championsByLocale,
  patchVersion,
  sources,
  allowlist,
}: ActiveTooltipValidationInput): ActiveTooltipValidationReport {
  const issues: ActiveTooltipIssue[] = [];
  const dropped: DroppedCalculationIssue[] = [];
  const missing = new Set<string>();
  interface TooltipLocation {
    championId: string;
    locale: DataLocale;
    slot: DroppedCalculationIssue["slot"];
    form?: "A" | "B";
    spellId: string;
  }
  const collectDropped = (
    location: TooltipLocation,
    entries: DroppedCalculation[] | undefined,
  ): void => {
    const slotId = location.form ? `${location.slot}/${location.form}` : location.slot;
    for (const entry of entries ?? []) {
      dropped.push({
        id: `${location.championId}:${slotId}:${entry.key}:${entry.reason}`,
        ...location,
        ...entry,
      });
    }
  };
  const collectUnresolved = (
    location: TooltipLocation & { slot: ActiveTooltipIssue["slot"] },
    unresolvedTokens: string[] | undefined,
  ): void => {
    if (!unresolvedTokens || unresolvedTokens.length === 0) return;
    issues.push({ ...location, unresolvedTokens });
  };
  let abilities = 0;
  let localized = 0;

  for (const { championId, locale, champion } of sortedChampionLocaleEntries(
    championsByLocale,
  )) {
    collectDropped(
      { championId, locale, slot: "P", spellId: champion.passive?.spellId ?? "unknown" },
      champion.passive?.tooltipDiagnostics?.droppedCalculations,
    );
    (champion.spells ?? []).forEach((spell, index) => {
      const slot = ABILITY_SLOTS[index];
      if (!slot) return;
      abilities += 1;
      const location = { championId, locale, slot, spellId: spell.id ?? "unknown" };
      collectDropped(location, spell.tooltipDiagnostics?.droppedCalculations);
      if (spell.tooltipSource === "communitydragon") localized += 1;
      else missing.add(`${championId}:${slot}`);
      collectUnresolved(location, spell.tooltipDiagnostics?.unresolvedTokens);

      // 변신 챔피언은 화면에 폼마다의 본문을 보인다. 폼 툴팁도 같은 기준선으로 본다.
      for (const form of spell.formDiagnostics ?? []) {
        const formLocation = { championId, locale, slot, form: form.form, spellId: form.spellId };
        collectDropped(formLocation, form.droppedCalculations);
        collectUnresolved(formLocation, form.unresolvedTokens);
      }
    });
  }

  const tokens = [...new Set(issues.flatMap((issue) => issue.unresolvedTokens))];
  const allowedTokens = new Set(allowlist.unresolvedTokens);
  const allowedMissing = new Set(allowlist.missingTooltips);
  const droppedIds = [...new Set(dropped.map((entry) => entry.id))];
  const allowedDropped = new Set(
    (allowlist.droppedCalculations ?? []).map((entry) => entry.id),
  );
  return {
    schemaVersion: 2,
    patchVersion,
    sources,
    totals: {
      abilities,
      localized,
      fallback: abilities - localized,
      withDiagnostics: issues.length,
      uniqueUnresolvedTokens: tokens.length,
      droppedCalculations: dropped.length,
    },
    issues,
    droppedCalculations: dropped,
    unexpectedTokens: tokens.filter((token) => !allowedTokens.has(token)).sort(),
    unexpectedMissingTooltips: [...missing]
      .filter((key) => !allowedMissing.has(key))
      .sort(),
    unexpectedDroppedCalculations: droppedIds
      .filter((id) => !allowedDropped.has(id))
      .sort(),
    staleAllowedTokens: allowlist.unresolvedTokens
      .filter((token) => !tokens.includes(token))
      .sort(),
    staleAllowedMissingTooltips: allowlist.missingTooltips
      .filter((key) => !missing.has(key))
      .sort(),
    staleAllowedDroppedCalculations: [...allowedDropped]
      .filter((id) => !droppedIds.includes(id))
      .sort(),
  };
}

/**
 * 기준선 위반만 실패로 본다.
 *
 * 새로 생긴 미해석 토큰·툴팁 누락은 회귀라 막아야 한다.
 * 반대로 해소된 항목은 개선이므로 막을 이유가 없다. 예전에는 이것도 실패로
 * 처리해서, 패치로 토큰 하나가 사라지기만 해도 CI 가 30분마다 죽고 데이터
 * 갱신이 멈췄다. 해소분은 허용 목록에서 자동으로 걷어낸다.
 */
export function assertActiveTooltipReport(
  report: ActiveTooltipValidationReport,
): void {
  if (
    report.unexpectedTokens.length === 0 &&
    report.unexpectedMissingTooltips.length === 0 &&
    report.unexpectedDroppedCalculations.length === 0
  ) {
    return;
  }
  throw new Error(
    `Active tooltip baseline regressed: ${report.unexpectedTokens.length} new tokens ` +
      `[${report.unexpectedTokens.slice(0, 5).join(", ")}], ` +
      `${report.unexpectedMissingTooltips.length} new missing tooltips ` +
      `[${report.unexpectedMissingTooltips.slice(0, 5).join(", ")}], ` +
      `${report.unexpectedDroppedCalculations.length} new dropped calculations ` +
      `[${report.unexpectedDroppedCalculations.slice(0, 5).join(", ")}]`,
  );
}

/**
 * 해소된 항목을 허용 목록에서 걷어낸다.
 * 목록이 실제와 어긋난 채 굳으면 다음 회귀를 못 잡는다.
 */
export function pruneAllowlist(
  allowlist: ActiveTooltipAllowlist,
  report: ActiveTooltipValidationReport,
): { allowlist: ActiveTooltipAllowlist; changed: boolean } {
  const staleTokens = new Set(report.staleAllowedTokens);
  const staleMissing = new Set(report.staleAllowedMissingTooltips);
  const staleDropped = new Set(report.staleAllowedDroppedCalculations);
  if (staleTokens.size === 0 && staleMissing.size === 0 && staleDropped.size === 0) {
    return { allowlist, changed: false };
  }
  return {
    allowlist: {
      unresolvedTokens: allowlist.unresolvedTokens.filter(
        (token) => !staleTokens.has(token),
      ),
      missingTooltips: allowlist.missingTooltips.filter(
        (key) => !staleMissing.has(key),
      ),
      droppedCalculations: (allowlist.droppedCalculations ?? []).filter(
        (entry) => !staleDropped.has(entry.id),
      ),
    },
    changed: true,
  };
}
