import type {
  AbilitySimulationCurve,
  AbilitySimulationExpr,
  AbilitySimulationStat,
} from "@/data/contracts/championData";

const LEVELS = 18;

/** 스킬 레벨과 챔피언 레벨을 1부터 받는다. 범위를 벗어나면 가장 가까운 값으로 붙인다. */
function clampIndex(value: number, length: number): number {
  if (length <= 0) return 0;
  return Math.min(Math.max(Math.trunc(value) - 1, 0), length - 1);
}

export function curveValue(curve: AbilitySimulationCurve, rank: number, level: number): number {
  if (curve.byRank) return curve.byRank[clampIndex(rank, curve.byRank.length)];
  if (curve.byLevel) return curve.byLevel[clampIndex(level, curve.byLevel.length)];
  const rows = curve.byRankAndLevel;
  if (!rows || rows.length === 0) return 0;
  const row = rows[clampIndex(rank, rows.length)];
  return row[clampIndex(level, row.length || LEVELS)];
}

export interface ExprEvalContext {
  rank: number;
  level: number;
  stat: (stat: AbilitySimulationStat) => number;
  /** 중첩 수를 요구하는 스킬에서만 쓰인다. 모르면 0. */
  buffStacks?: number;
}

export function evaluateExpr(node: AbilitySimulationExpr, ctx: ExprEvalContext): number {
  switch (node.kind) {
    case "value":
      return curveValue(node.value, ctx.rank, ctx.level);
    case "stat":
      return curveValue(node.coefficient, ctx.rank, ctx.level) * ctx.stat(node.stat);
    case "buffStacks":
      return curveValue(node.coefficient, ctx.rank, ctx.level) * (ctx.buffStacks ?? 0);
    case "sum":
      return node.parts.reduce((total, part) => total + evaluateExpr(part, ctx), 0);
    case "product":
      return node.parts.reduce((total, part) => total * evaluateExpr(part, ctx), 1);
  }
}

export interface ExprFormatOptions {
  /** 스킬 레벨을 고정하면 그 레벨 값만 쓴다. 비우면 레벨별 값을 `/` 로 늘어놓는다. */
  rank?: number;
  level?: number;
  statLabel: (stat: AbilitySimulationStat) => string;
  stacksLabel: string;
}

function trim(value: number): string {
  return String(Number(value.toFixed(4)));
}

function percent(value: number): string {
  const scaled = value * 100;
  return `${Number.isInteger(scaled) ? scaled : Number(scaled.toFixed(2))}%`;
}

/** 랭크마다 값이 다르면 `300/475/650`, 같으면 하나만 쓴다. */
function curveText(
  curve: AbilitySimulationCurve,
  options: ExprFormatOptions,
  format: (value: number) => string,
): string {
  const level = options.level ?? LEVELS;
  if (options.rank !== undefined) return format(curveValue(curve, options.rank, level));
  const ranks = curve.byRank ?? curve.byRankAndLevel?.map((_, index) =>
    curveValue(curve, index + 1, level));
  if (!ranks) return format(curveValue(curve, 1, level));
  const unique = [...new Set(ranks.map((value) => Number(value.toFixed(4))))];
  return (unique.length === 1 ? unique : ranks).map(format).join("/");
}

/** 곱 안에 들어가는 합은 괄호로 묶어야 뜻이 유지된다. */
function wrap(node: AbilitySimulationExpr, text: string): string {
  return node.kind === "sum" ? `(${text})` : text;
}

/** `a + -1` 로 읽히지 않게 음수 항은 뺄셈으로 잇는다. */
function joinSum(texts: string[]): string {
  return texts.reduce((left, text) =>
    text.startsWith("-") ? `${left} − ${text.slice(1)}` : `${left} + ${text}`);
}

export function formatExpr(node: AbilitySimulationExpr, options: ExprFormatOptions): string {
  switch (node.kind) {
    case "value":
      return curveText(node.value, options, trim);
    case "stat": {
      const coefficient = curveText(node.coefficient, options, percent);
      // 계수가 1 이면 `100% 치명타 피해량` 보다 `치명타 피해량` 이 읽기 낫다.
      return coefficient === "100%"
        ? options.statLabel(node.stat)
        : `${coefficient} ${options.statLabel(node.stat)}`;
    }
    case "buffStacks": {
      const coefficient = curveText(node.coefficient, options, trim);
      return coefficient === "1"
        ? options.stacksLabel
        : `${coefficient} × ${options.stacksLabel}`;
    }
    case "sum":
      return joinSum(node.parts.map((part) => formatExpr(part, options)));
    case "product":
      return node.parts
        .map((part) => wrap(part, formatExpr(part, options)))
        .join(" × ");
  }
}
