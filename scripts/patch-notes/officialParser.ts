import type { PatchEntityKind } from "../../src/data/contracts/patchNotes";
import { parseFragment, serialize, type DefaultTreeAdapterTypes } from "parse5";

export interface OfficialRow { label: string; before: string; after: string }
export interface OfficialSection { title: string; rows: OfficialRow[] }
export interface OfficialEntity { kind: PatchEntityKind; title: string; sections: OfficialSection[] }
export interface OfficialArticle { entities: OfficialEntity[]; rowCount: number; excluded: string[] }

export function plainText(html: string): string {
  const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return html.replace(/<[^>]*>/g, " ")
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, code: string) => String.fromCodePoint(
      code.startsWith("x") ? Number.parseInt(code.slice(1), 16) : Number(code)))
    .replace(/&([a-z]+);/gi, (entity, name: string) => entities[name] ?? entity)
    .replace(/\s+/g, " ").trim();
}

function embeddedArticle(value: unknown): string | undefined {
  if (typeof value === "string") {
    return /<h2\b/.test(value) && /patch-notes-container|patch-change-block|英雄/.test(value) ? value : undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  for (const child of Object.values(value)) {
    const found = embeddedArticle(child);
    if (found) return found;
  }
  return undefined;
}

export function officialArticleHtml(html: string): string {
  const data = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (data) {
    const article = embeddedArticle(JSON.parse(data));
    if (article) return article;
  }
  if (/<h2\b/.test(html) && /patch-notes-container|patch-champions/.test(html)) return html.split("</main>")[0];
  throw new Error("Official patch article body missing");
}

function sectionKind(title: string, id?: string): PatchEntityKind | undefined {
  if (id === "patch-champions" || ["Champions", "챔피언", "英雄"].includes(title)) return "champion";
  if (id === "patch-items" || ["Items", "아이템", "道具", "装备"].includes(title)) return "item";
  if (["patch-systems", "patch-runes"].includes(id ?? "") ||
    ["Systems", "게임 체계", "系統", "系统", "Runes", "룬", "符文"].includes(title)) return "system";
  return undefined;
}

function containsBlock(node: DefaultTreeAdapterTypes.Node): boolean {
  return "childNodes" in node && node.childNodes.some(child =>
    ("tagName" in child && /^(?:h[234]|li)$/.test(child.tagName)) || containsBlock(child));
}

function* articleBlocks(node: DefaultTreeAdapterTypes.Node): Generator<DefaultTreeAdapterTypes.Element> {
  if ("tagName" in node && (/^h[234]$/.test(node.tagName) || (node.tagName === "li" && !containsBlock(node)))) {
    yield node;
    return;
  }
  if ("childNodes" in node) for (const child of node.childNodes) yield* articleBlocks(child);
}

function blockRows(block: DefaultTreeAdapterTypes.Element): OfficialRow[] {
  const html = serialize(block);
  const arrows = html.match(/⇒|→/g)?.length ?? 0;
  const labels = [...html.matchAll(/<strong\b[^>]*>[^<>]+<\/strong>\s*[:：]/gi)];
  if (arrows > 1 && labels.length !== arrows) throw new Error(`Ambiguous official changes: ${plainText(html)}`);
  const starts = arrows > 1 ? [0, ...labels.slice(1).map(match => match.index)] : [0];
  return starts.map((start, index) => {
    const title = plainText(html.slice(start, starts[index + 1]));
    const arrow = title.match(/^(.*?)\s*(?:⇒|→)\s*(.+)$/);
    const left = arrow?.[1] ?? title;
    const colon = left.search(/[:：]/);
    if (arrow && colon < 0) throw new Error(`Official change has no label: ${title}`);
    return { label: colon >= 0 ? left.slice(0, colon).trim() : "",
      before: arrow ? left.slice(colon + 1).trim() : "",
      after: arrow ? arrow[2].trim() : colon >= 0 ? left.slice(colon + 1).trim() : title };
  });
}

export function parseOfficialArticle(html: string): OfficialArticle {
  const entities: OfficialEntity[] = [];
  const excluded: string[] = [];
  let kind: PatchEntityKind | undefined;
  let entity: OfficialEntity | undefined;
  let section: OfficialSection | undefined;
  let skip = false;
  let rowCount = 0;
  for (const block of articleBlocks(parseFragment(html))) {
    const tag = block.tagName;
    const title = plainText(serialize(block));
    if (tag === "h2") {
      kind = sectionKind(title, block.attrs.find(attribute => attribute.name === "id")?.value);
      entity = undefined; section = undefined; skip = false;
      continue;
    }
    if (!kind) continue;
    if (tag === "h3" || (tag === "h4" && (kind === "system" || !entity))) {
      entity = { kind, title, sections: [] }; entities.push(entity);
      section = undefined; skip = false;
    }
    if (tag === "h4") {
      skip = /Scoreboard Cleanup|점수판 정리|計分板(?:整理|調整)/.test(title);
      section = { title, rows: [] }; entity?.sections.push(section);
    }
    if (tag !== "li") continue;
    if (skip) { excluded.push(title); continue; }
    if (!entity) throw new Error(`Official row has no entity: ${title}`);
    if (!section) { section = { title: "", rows: [] }; entity.sections.push(section); }
    const rows = blockRows(block);
    section.rows.push(...rows); rowCount += rows.length;
  }
  const populated = entities.map(entry => ({ ...entry, sections: entry.sections.filter(group => group.rows.length) }))
    .filter(entry => entry.sections.length);
  if (!rowCount || !populated.some(entry => entry.kind === "champion")) throw new Error("Official champion changes missing");
  return { entities: populated, rowCount, excluded };
}
