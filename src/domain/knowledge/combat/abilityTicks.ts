import type { Language } from "../../../shared/i18n";

export type TickText = Record<Language, string>;
export interface PeriodicEffect {
  label: TickText;
  intervalSeconds?: number | number[];
  durationSeconds?: number | number[];
  count?: number | number[];
  countMode?: "continuous" | "duration_equivalent";
  perTick?: TickText;
  note?: TickText;
  forms?: Array<"A" | "B">;
}
export interface SpellTicks {
  status: "known" | "unknown" | "not_documented";
  effects: PeriodicEffect[];
  sources: string[];
  note?: TickText;
}

const WORDS = {
  ko_KR: { heading: "지속 틱", every: "초 간격", duration: "초 지속", count: "틱", equivalent: "틱분", continuous: "계속 적중 시",
    unknown: "틱 간격·횟수는 현재 자료로 확인되지 않았습니다.", absent: "현재 자료에 이 스킬 자체의 지속 피해·회복 틱은 명시되어 있지 않습니다." },
  en_US: { heading: "Periodic ticks", every: "s interval", duration: "s duration", count: "ticks", equivalent: "ticks' worth", continuous: "with continuous contact",
    unknown: "The tick interval and count are unverified in the current sources.", absent: "The current sources do not specify damage or healing ticks for this ability itself." },
  zh_CN: { heading: "周期跳数", every: "秒间隔", duration: "秒持续", count: "跳", equivalent: "跳对应量", continuous: "持续命中时",
    unknown: "当前资料尚未确认跳数及间隔。", absent: "当前资料未注明该技能本身的持续伤害或治疗跳数。" },
} as const;

function numbers(value: number | number[], lang: Language): string {
  const approximate = { ko_KR: "약 ", en_US: "≈", zh_CN: "约" }[lang];
  return (Array.isArray(value) ? value : [value]).map(n => {
    const rounded = Math.round(n * 10000) / 10000;
    return `${Math.abs(n - rounded) > 1e-10 ? approximate : ""}${rounded}`;
  }).join("/");
}

export function tickHeading(lang: Language = "ko_KR"): string { return WORDS[lang].heading; }

export function tickEffectText(effect: PeriodicEffect, lang: Language = "ko_KR"): string {
  const w = WORDS[lang];
  const values: string[] = [];
  if (effect.intervalSeconds !== undefined) values.push(`${numbers(effect.intervalSeconds, lang)}${w.every}`);
  if (effect.durationSeconds !== undefined) values.push(`${numbers(effect.durationSeconds, lang)}${w.duration}`);
  if (effect.count !== undefined) {
    const mode = effect.countMode === "duration_equivalent" ? w.equivalent : w.count;
    values.push(`${numbers(effect.count, lang)}${mode}${effect.countMode === "continuous" ? ` (${w.continuous})` : ""}`);
  }
  if (effect.perTick) values.push(effect.perTick[lang]);
  if (effect.note) values.push(effect.note[lang]);
  return `${effect.label[lang]}: ${values.join(" · ")}`;
}

export function tickText(ticks: SpellTicks | undefined, lang: Language = "ko_KR"): string {
  if (!ticks || ticks.status === "unknown") return [WORDS[lang].unknown, ticks?.note?.[lang]].filter(Boolean).join(" ");
  if (ticks.status === "not_documented") return WORDS[lang].absent;
  return ticks.effects.map(effect => tickEffectText(effect, lang)).join("\n");
}
