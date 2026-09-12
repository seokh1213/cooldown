import { parseItemDescription } from "../../../src/lib/spellTooltipParser/parser";
import { htmlToPlainText } from "../../../src/lib/htmlText";
import type {
  ItemEffectKind,
  NormalizedItemEffect,
} from "../../../src/types/combatNormalized";

const EFFECT_TAGS: Record<string, ItemEffectKind> = {
  passive: "passive",
  active: "active",
  aura: "aura",
  mythicpassive: "mythicPassive",
};

function trimBreaks(value: string): string {
  return value.replace(/^(?:\s|<br\s*\/?\s*>)+|(?:\s|<br\s*\/?\s*>)+$/gi, "");
}

export function structureItemDescription(
  id: string,
  description: string | undefined,
) {
  const raw = description ?? "";
  const statBlock = raw.match(/<stats>([\s\S]*?)<\/stats>/i)?.[1] ?? "";
  const statDescriptions = statBlock
    .split(/<br\s*\/?\s*>/i)
    .filter((line) => htmlToPlainText(line))
    .map((line) => parseItemDescription(line));
  const body = trimBreaks(
    raw
      .replace(/<stats>[\s\S]*?<\/stats>/gi, "")
      .replace(/<\/?mainText>/gi, ""),
  );
  const headings = [
    ...body.matchAll(/<(passive|active|aura|mythicPassive)>([\s\S]*?)<\/\1>/gi),
  ];
  const effects: NormalizedItemEffect[] = [];
  const append = (name: string, kind: ItemEffectKind, text: string) => {
    const content = trimBreaks(text);
    if (!name && !htmlToPlainText(content)) return;
    effects.push({
      id: `item-${id}-effect-${effects.length}`,
      name: htmlToPlainText(name),
      kind,
      description: parseItemDescription(content),
    });
  };
  append("", "passive", body.slice(0, headings[0]?.index ?? body.length));
  for (const [index, heading] of headings.entries()) {
    const start = (heading.index ?? 0) + heading[0].length;
    append(
      heading[2],
      EFFECT_TAGS[heading[1].toLowerCase()],
      body.slice(start, headings[index + 1]?.index ?? body.length),
    );
  }
  return { statDescriptions, effects };
}
