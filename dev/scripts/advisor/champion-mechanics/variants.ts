/** 폼은 기존 구조화 데이터에서 복사하고, 하위 스킬은 출처에 있는 제목 구간으로 나눈다. */
import type { AbilityV2 } from "../../../../src/domain/game/contracts/championData";
import { stripHtml } from "../../../../src/domain/knowledge/text";
import type { Slot, SourceDoc, Variant } from "./contract";

const GROUPS: Record<string, Array<[string, string]>> = {
  "Hwei.Q": [["QQ", "Devastating Fire"], ["QW", "Severing Bolt"], ["QE", "Molten Fissure"]],
  "Hwei.W": [["WQ", "Fleeting Current"], ["WW", "Pool of Reflection"], ["WE", "Stirring Lights"]],
  "Hwei.E": [["EQ", "Grim Visage"], ["EW", "Gaze of the Abyss"], ["EE", "Crushing Maw"]],
  "Aphelios.Q": [["Calibrum", "Calibrum Active:"], ["Severum", "Severum Active:"], ["Infernum", "Infernum Active:"], ["Crescendum", "Crescendum Active:"], ["Gravitum", "Gravitum Active:"]],
  "Aphelios.R": [["Calibrum", "Calibrum Bonus:"], ["Severum", "Severum Bonus:"], ["Infernum", "Infernum Bonus:"], ["Crescendum", "Crescendum Bonus:"], ["Gravitum", "Gravitum Bonus:"]],
};
export function collectVariants(context: { champion: string; slot: Slot; ability: AbilityV2; sources: SourceDoc[] }): Variant[] {
  const { champion, slot, ability, sources } = context;
  const result: Variant[] = [{ id: "base", label: "공통", sourceIds: sources.map(source => source.id) }];
  for (const form of ability.forms ?? []) {
    const id = `form:${form.key}`;
    const sourceId = `form:${form.key}:en`;
    sources.push({ id: sourceId, text: stripHtml(form.bodyHtml), locale: "en_US", tier: "tooltip", variant: id });
    result.push({ id, label: form.label, sourceIds: [sourceId] });
  }
  const body = sources.find(source => source.id === "en:body")?.text ?? "";
  const found = (GROUPS[`${champion}.${slot}`] ?? []).map(([id, label]) => ({ id, label, start: body.indexOf(label) }));
  for (const item of found) {
    if (item.start < 0) continue;
    const end = Math.min(...found.filter(other => other.start > item.start).map(other => other.start), body.length);
    const sourceId = `variant:${item.id}:en`;
    sources.push({ id: sourceId, text: body.slice(item.start, end).trim(), locale: "en_US", tier: "tooltip", variant: item.id });
    result.push({ id: item.id, label: item.label, sourceIds: [sourceId] });
  }
  return result;
}
