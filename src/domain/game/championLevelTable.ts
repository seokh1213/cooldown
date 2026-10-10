/**
 * 툴팁 아래 "챔피언 레벨별 수치" 표의 칸을 정한다.
 *
 * 레벨 범위 하나를 두 줄 표(머리: 레벨, 칸: 값)로 적는다. 1~20레벨 값을 다 적으면 표가
 * 툴팁보다 넓어져서, 값이 어떻게 오르는지에 따라 칸을 줄인다.
 *   값이 바뀌는 레벨이 적다      바뀌는 레벨과 그 값만 (벡스 P 25 · 6레벨 22 · 11레벨 19 · 16레벨 16)
 *   레벨당 증가량이 몇 번만 바뀐다  1레벨 값과 증가량 구간 (요네 W 40 · 2–8레벨 +10씩 · 9–13 +20씩 · 14~ +40씩)
 *   레벨마다 고르게 오른다        1레벨 값 · 18레벨 값 · 레벨당 증가량 (보간형, 19·20레벨은 18레벨 값)
 *   레벨마다 증가량이 달라진다     1레벨 값 · 18레벨 값 · 처음과 끝 증가량 (스탯 성장 곡선)
 */
import type { AbilityLevelValues } from "@/domain/game/contracts/championData";
import { ABILITY_SCALING_MAX_LEVEL } from "@/domain/game/championLevel";
import { formatLevelValue } from "@/domain/game/tooltip/calculationResultFormatter";

export type LevelTableHead =
  | { kind: "levels"; from: number; to?: number; onward?: true }
  | { kind: "perLevel" };

export type LevelTableCell =
  /** 그 레벨부터의 값 */
  | { kind: "value"; text: string }
  /** 구간 안에서 레벨마다 더해지는 양 */
  | { kind: "step"; text: string }
  /** 처음 레벨과 끝 레벨에서 더해지는 양 */
  | { kind: "growth"; first: string; last: string };

export interface LevelTableColumn {
  head: LevelTableHead;
  cell: LevelTableCell;
}

/** 값이 바뀌는 레벨이 이만큼 이하면 바뀌는 레벨만 적는다 (오리아나 P 2 ~ 8 이 일곱 번) */
const MAX_CHANGE_COLUMNS = 7;

/** 레벨당 증가량 구간이 이만큼 이하면 구간으로 적는다. 넘으면 레벨마다 증가량이 다른 곡선이다 */
const MAX_STEP_SEGMENTS = 4;

interface StepSegment {
  from: number;
  to: number;
  step: number;
}

/** 2레벨부터 레벨당 증가량이 같은 레벨끼리 묶는다 */
function stepSegments(values: readonly number[]): StepSegment[] {
  const tolerance = 1e-5 * Math.max(1, ...values.map(Math.abs));
  const segments: StepSegment[] = [];
  for (let index = 1; index < values.length; index += 1) {
    const step = values[index] - values[index - 1];
    const last = segments[segments.length - 1];
    if (last && Math.abs(last.step - step) <= tolerance) last.to = index + 1;
    else segments.push({ from: index + 1, to: index + 1, step: Math.abs(step) <= tolerance ? 0 : step });
  }
  return segments;
}

/** 증가량은 소수 둘째 자리까지 적되, 셋째 자리에서 딱 떨어지면 그대로 둔다 (라칸 P −0.875) */
function stepText(step: number, unit: string): string {
  const magnitude = Math.abs(step);
  const thousandths = magnitude * 1000;
  const digits = Math.abs(thousandths - Math.round(thousandths)) < 1e-6 ? 3 : 2;
  return `${step < 0 ? "−" : "+"}${formatLevelValue(magnitude, { digits, trimZeros: true })}${unit}`;
}

function levelsHead(from: number, to: number, lastLevel: number): LevelTableHead {
  if (to === lastLevel && from < lastLevel) return { kind: "levels", from, onward: true };
  return from === to ? { kind: "levels", from } : { kind: "levels", from, to };
}

export function levelTableColumns(entry: AbilityLevelValues): LevelTableColumn[] {
  const { values } = entry;
  const lastLevel = values.length;
  const unit = entry.percent ? "%" : "";
  const shown = values.map((value) => `${formatLevelValue(value, entry)}${unit}`);
  const valueAt = (level: number): LevelTableCell => ({ kind: "value", text: shown[level - 1] });

  const changes = shown.flatMap((text, index) => (index === 0 || text !== shown[index - 1] ? [index + 1] : []));
  if (changes.length <= MAX_CHANGE_COLUMNS) {
    return changes.map((level, index) => ({
      head: index === changes.length - 1 && level < lastLevel
        ? { kind: "levels", from: level, onward: true }
        : { kind: "levels", from: level },
      cell: valueAt(level),
    }));
  }

  const first: LevelTableColumn = { head: { kind: "levels", from: 1 }, cell: valueAt(1) };
  const segments = stepSegments(values);
  const holdsAfter = (level: number): boolean => values.slice(level - 1).every((value) => value === values[level - 1]);

  // 레벨마다 고르게 오르다 18레벨에서 멈춘다 (레벨 보간)
  if (
    segments.length <= 2 &&
    segments[0].step !== 0 &&
    segments[0].to === ABILITY_SCALING_MAX_LEVEL &&
    holdsAfter(ABILITY_SCALING_MAX_LEVEL)
  ) {
    return [
      first,
      { head: { kind: "levels", from: ABILITY_SCALING_MAX_LEVEL, onward: true }, cell: valueAt(ABILITY_SCALING_MAX_LEVEL) },
      { head: { kind: "perLevel" }, cell: { kind: "step", text: stepText(segments[0].step, unit) } },
    ];
  }

  if (segments.length <= MAX_STEP_SEGMENTS) {
    return [
      first,
      ...segments.map((segment): LevelTableColumn => ({
        head: levelsHead(segment.from, segment.to, lastLevel),
        // 더 오르지 않는 구간은 그 값을 적는다 (신짜오 W 미니언 피해 16레벨 뒤)
        cell: segment.step === 0 ? valueAt(segment.from) : { kind: "step", text: stepText(segment.step, unit) },
      })),
    ];
  }

  const endLevel = holdsAfter(ABILITY_SCALING_MAX_LEVEL) ? ABILITY_SCALING_MAX_LEVEL : lastLevel;
  return [
    first,
    { head: endLevel < lastLevel ? { kind: "levels", from: endLevel, onward: true } : { kind: "levels", from: endLevel }, cell: valueAt(endLevel) },
    {
      head: { kind: "perLevel" },
      cell: {
        kind: "growth",
        first: stepText(values[1] - values[0], unit),
        last: stepText(values[endLevel - 1] - values[endLevel - 2], unit),
      },
    },
  ];
}
