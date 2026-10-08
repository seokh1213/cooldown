import type { PatchEntityKind } from "../../src/data/contracts/patchNotes";

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

function sectionKind(title: string, attributes: string): PatchEntityKind | undefined {
  if (/id=["']patch-champions["']/.test(attributes) || ["Champions", "챔피언", "英雄"].includes(title)) return "champion";
  if (/id=["']patch-items["']/.test(attributes) || ["Items", "아이템", "道具", "装备"].includes(title)) return "item";
  if (/id=["']patch-systems["']/.test(attributes) || ["Systems", "게임 체계", "系統", "系统"].includes(title)) return "system";
  return undefined;
}

export function parseOfficialArticle(html: string): OfficialArticle {
  const entities: OfficialEntity[] = [];
  const excluded: string[] = [];
  let kind: PatchEntityKind | undefined;
  let entity: OfficialEntity | undefined;
  let section: OfficialSection | undefined;
  let skip = false;
  let rowCount = 0;
  for (const match of html.matchAll(/<(h[234]|li)\b([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const [, tag, attributes, content] = match;
    const title = plainText(content);
    if (tag === "h2") {
      kind = sectionKind(title, attributes);
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
    const arrow = title.match(/^(.*?)\s*(?:⇒|→)\s*(.+)$/);
    const colon = arrow?.[1].search(/[:：]/) ?? -1;
    if (arrow && colon < 0) throw new Error(`Official change has no label: ${title}`);
    const row = arrow ? { label: arrow[1].slice(0, colon).trim(), before: arrow[1].slice(colon + 1).trim(), after: arrow[2].trim() }
      : { label: "", before: "", after: title };
    section.rows.push(row); rowCount++;
  }
  const populated = entities.map(entry => ({ ...entry, sections: entry.sections.filter(group => group.rows.length) }))
    .filter(entry => entry.sections.length);
  if (!rowCount || !populated.some(entry => entry.kind === "champion")) throw new Error("Official champion changes missing");
  return { entities: populated, rowCount, excluded };
}
