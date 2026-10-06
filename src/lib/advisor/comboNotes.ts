/** 상황별 연계는 순서·조건을 생략하지 않고, 못 쓰는 스킬이 든 예시는 제외한다. */
import type { PlaybookEntry } from "@/lib/knowledge/playbookCore";
import { comboSlots } from "@/lib/knowledge/comboGuide";
import type { SelectedNotes } from "./noteSelect";
import { aliasAt, aliasesOf } from "@/lib/knowledge/searchAliases";

interface ComboSelection {
  question: string;
  locale?: string;
  translations?: Record<string, string>;
  unavailable?: string[];
}

export function selectComboNotes(entries: PlaybookEntry[], options: ComboSelection): SelectedNotes {
  const { question, locale, translations, unavailable = [] } = options;
  const available = entries.filter(entry => entry.category === "combo");
  const named = available.filter(entry => entry.id && aliasesOf(`note:${entry.id}`).some(alias => aliasAt(question, alias) >= 0));
  const combos = named.length ? named : available;
  const curated = locale && locale !== "ko_KR" ? [] : combos.filter(entry => entry.combo);
  const allowed = curated.filter(entry => {
    const keys = entry.combo!.keys;
    return !comboSlots(keys).some(slot => unavailable.includes(slot))
      && !(unavailable.includes("점멸") && keys.includes("점멸"));
  });
  const wantsFlash = /점멸|flash|闪现/i.test(question);
  const selected = wantsFlash ? [...allowed].sort((a, b) => Number(b.combo!.keys.includes("점멸")) - Number(a.combo!.keys.includes("점멸"))) : allowed;
  const textOf = (entry: PlaybookEntry) => locale && locale !== "ko_KR"
    ? entry.id ? translations?.[entry.id] : undefined : entry.text;
  const playing = curated.length ? selected.map(entry => entry.text)
    : unavailable.length ? [] : combos.flatMap(entry => { const text = textOf(entry); return text ? [`- ${text}`] : []; }).slice(0, 2);
  const sources = selected.map(entry => entry.source);
  if (/라인전|\blaning\b|lane.*tips?|对线/i.test(question)) {
    const laneEntries = entries.filter(entry => entry.category === "laning" && textOf(entry));
    const laning = laneEntries.find(entry => entry.id?.endsWith("-web-laning")) ?? laneEntries[0];
    if (laning) {
      playing.push(`\n**${locale === "en_US" ? "Laning" : locale === "zh_CN" ? "对线" : "라인전"}**\n${textOf(laning)}`);
      sources.push(laning.source);
    }
  }
  return { playing, against: [], perspective: "playing", detail: "full", topic: "combo", unavailable,
    sources: [...new Set(sources.filter((url): url is string => Boolean(url?.startsWith("https://"))))] };
}

export function comboDigest(name: string, notes: SelectedNotes, lang: string): string {
  const body = notes.playing.join("\n");
  if (!body) return lang === "en_US" ? "I don't have a verified combo for the abilities currently available. Tell me which abilities are ready."
    : lang === "zh_CN" ? "没有符合当前可用技能的已核实连招。请告诉我哪些技能可用。"
      : "지금 쓸 수 있는 스킬로 구성된 콤보는 확인한 노트에 없어요. 사용 가능한 스킬을 알려 주세요.";
  const intro = lang === "en_US" ? `${name}'s combos by situation. AA means basic attack.`
    : lang === "zh_CN" ? `${name}的情境连招。AA表示普攻。`
      : `${name} 콤보는 상황별로 이렇게 쓸 수 있어요. 평타는 기본 공격, 숫자는 스킬 재사용 순서예요.`;
  return [intro, body].join("\n\n");
}
