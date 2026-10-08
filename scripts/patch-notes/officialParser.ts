import type { PatchEntityKind } from "../../src/data/contracts/patchNotes";
import { parseFragment, serialize, type DefaultTreeAdapterTypes } from "parse5";
import { officialScope, type OfficialScope, type OfficialSectionCoverage, type OfficialChampions } from "./officialScope";

export interface OfficialRow { label: string; before: string; after: string }
export interface OfficialSection { title: string; rows: OfficialRow[] }
export interface OfficialEntity { kind: PatchEntityKind; title: string; sections: OfficialSection[]; grouped?: boolean }
export interface OfficialArticle { entities: OfficialEntity[]; rowCount: number; excluded: string[]; coverage?: OfficialSectionCoverage[] }
export interface OfficialParseOptions { champions?: OfficialChampions; championIcons?: Record<string, string> }

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

function containsBlock(node: DefaultTreeAdapterTypes.Node): boolean {
  return "childNodes" in node && node.childNodes.some(child =>
    ("tagName" in child && /^(?:h[234]|li)$/.test(child.tagName)) || containsBlock(child));
}

function followingList(node: DefaultTreeAdapterTypes.Element): boolean {
  const siblings = node.parentNode?.childNodes ?? [];
  let next = siblings.slice(siblings.indexOf(node) + 1).find(sibling => "tagName" in sibling);
  while (next && "tagName" in next && /^(?:strong|em|span)$/.test(next.tagName)) {
    next = next.childNodes.find(child => "tagName" in child);
  }
  return !!next && "tagName" in next && /^(?:ul|ol)$/.test(next.tagName);
}

function* articleBlocks(node: DefaultTreeAdapterTypes.Node): Generator<DefaultTreeAdapterTypes.Element> {
  if ("tagName" in node && node.tagName === "p") {
    const strong = node.childNodes.find(child => "tagName" in child && child.tagName === "strong");
    if (strong && "tagName" in strong && plainText(serialize(node)) === plainText(serialize(strong)) &&
      followingList(node)) { yield node; return; }
  }
  if ("tagName" in node && node.tagName === "blockquote" &&
    /[:：]$|다음(?:과 같습니다| 효과가 적용됩니다)\.$/.test(plainText(serialize(node)))) {
    if (followingList(node)) { yield node; return; }
  }
  if ("tagName" in node && (/^h[234]$/.test(node.tagName) || (node.tagName === "li" && !containsBlock(node)))) {
    yield node;
    if (/^h[234]$/.test(node.tagName) && containsBlock(node)) {
      for (const child of node.childNodes) yield* articleBlocks(child);
    }
    return;
  }
  if ("childNodes" in node) for (const child of node.childNodes) yield* articleBlocks(child);
}

function headingText(block: DefaultTreeAdapterTypes.Element): string {
  return plainText(serialize({ ...block, childNodes: block.childNodes.filter(child =>
    !("tagName" in child && /^(?:h[234]|p|blockquote|ul|ol|div)$/.test(child.tagName))) }));
}

function headingImage(block: DefaultTreeAdapterTypes.Element): string | undefined {
  return serialize(block).match(/<img\b[^>]*src=["']([^"']+)/)?.[1];
}

export function officialChampionIcons(html: string, champions?: OfficialChampions): Record<string, string> {
  const icons: Record<string, string> = {};
  let root: string | undefined;
  for (const block of articleBlocks(parseFragment(html))) {
    if (block.tagName === "h2") root = officialScope({ title: plainText(serialize(block)),
      id: block.attrs.find(attribute => attribute.name === "id")?.value, champions }).rootEntity;
    if (root && /^h[34]$/.test(block.tagName)) {
      const icon = headingImage(block);
      if (icon) icons[icon] = root;
    }
  }
  return icons;
}

function rootChampionFromIcons(blocks: DefaultTreeAdapterTypes.Element[], index: number, options: OfficialParseOptions): string | undefined {
  for (const block of blocks.slice(index + 1)) {
    if (block.tagName === "h2") break;
    if (!/^h[34]$/.test(block.tagName)) continue;
    const url = headingImage(block);
    if (url && options.championIcons?.[url]) return options.championIcons[url];
    const filename = url?.split("/").at(-1);
    if (!filename) continue;
    const id = Object.keys(options.champions ?? {}).find(candidate =>
      new RegExp(`^${candidate}(?:_|[PQWER]\\d*[_.]|\\.)`, "i").test(filename));
    if (id) return id;
  }
  return undefined;
}

function blockRows(block: DefaultTreeAdapterTypes.Element): OfficialRow[] {
  const html = serialize(block);
  if (block.tagName === "blockquote") return [{ label: "", before: "", after: plainText(html) }];
  const arrows = html.match(/⇒|→/g)?.length ?? 0;
  const labels = [...html.matchAll(/<strong\b[^>]*>[^<>]+<\/strong>\s*[:：]/gi)];
  if (arrows > 1 && labels.length !== arrows) {
    const parenthetical = /[（(][^）)]*(?:⇒|→)[^）)]*[）)]/.test(plainText(html));
    if (!parenthetical) throw new Error(`Ambiguous official changes: ${plainText(html)}`);
  }
  const starts = arrows > 1 && labels.length === arrows ? [0, ...labels.slice(1).map(match => match.index)] : [0];
  return starts.map((start, index) => {
    const fragment = html.slice(start, starts[index + 1]);
    const title = plainText(fragment);
    const arrow = title.match(/^(.*?)\s*(?:⇒|→)\s*(.+)$/);
    const left = arrow?.[1] ?? title;
    const candidateColon = left.search(/(?<!\d)[:：]|[:：](?!\d)/);
    const parenthesis = left.search(/[(（]/);
    const colon = parenthesis >= 0 && parenthesis < candidateColon ? -1 : candidateColon;
    const strong = fragment.match(/^(.*?<strong\b[^>]*>[^<>]+<\/strong>)/i)?.[1];
    const strongTitle = strong ? plainText(strong) : "";
    const label = colon >= 0 ? left.slice(0, colon).trim() :
      strongTitle && left.startsWith(strongTitle) && !/^[\d\s./%+-]+$/.test(strongTitle) ? strongTitle : "";
    return { label,
      before: arrow ? left.slice(label.length).replace(/^\s*[:：；]\s*/, "").trim() : "",
      after: arrow ? arrow[2].trim() : colon >= 0 ? left.slice(colon + 1).trim() : title };
  });
}

export function parseOfficialArticle(html: string, options: OfficialParseOptions = {}): OfficialArticle {
  const entities: OfficialEntity[] = [];
  const excluded: string[] = [];
  let kind: PatchEntityKind | undefined;
  let entity: OfficialEntity | undefined;
  let entityHeadingLevel: number | undefined;
  let section: OfficialSection | undefined;
  let skip = false;
  let rowCount = 0;
  let scope: OfficialScope | undefined;
  const coverage: OfficialSectionCoverage[] = [];
  let primaryChampionsSeen = false;
  let parentSection = "";
  const blocks = [...articleBlocks(parseFragment(html))];
  for (const [blockIndex, block] of blocks.entries()) {
    const tag = block.tagName;
    const title = /^h[234]$/.test(tag) ? headingText(block) : plainText(serialize(block));
    if (/^h[34]$/.test(tag) && !title) continue;
    if (tag === "h2") {
      const id = block.attrs.find(attribute => attribute.name === "id")?.value;
      const primaryChampions = /^(?:Champions|챔피언|英雄)$/.test(title) && (!id || id === "patch-champions");
      scope = officialScope({ title, id, previous: primaryChampions && !primaryChampionsSeen ? undefined : scope, champions: options.champions });
      primaryChampionsSeen ||= primaryChampions;
      const rootChampion = scope.scope === "unknown" ? rootChampionFromIcons(blocks, blockIndex, options) : undefined;
      if (rootChampion) scope = { ...scope, scope: "balance", kind: "champion", rootEntity: rootChampion };
      coverage.push({ title, id: scope.id, scope: scope.scope, rows: 0 });
      kind = scope.kind;
      entity = undefined; entityHeadingLevel = undefined; section = undefined; skip = false; parentSection = "";
      if (scope.rootEntity) { entity = { kind: "champion", title: scope.rootEntity, sections: [] }; entities.push(entity); entityHeadingLevel = 2; }
      if (scope.groupSections) { entity = { kind: "system", title, sections: [], grouped: true }; entities.push(entity); entityHeadingLevel = 2; }
      continue;
    }
    if (tag === "li" && coverage.length) coverage.at(-1)!.rows++;
    if (!kind) continue;
    const rootSection = scope?.groupSections || scope?.rootEntity;
    if (!rootSection && (tag === "h3" || (tag === "h4" &&
      (!entity || entityHeadingLevel === 4 || (kind === "system" && entityHeadingLevel === 2))))) {
      entity = { kind, title, sections: [] }; entities.push(entity);
      entityHeadingLevel = tag === "h3" ? 3 : 4;
      section = undefined; skip = false;
    }
    if (tag === "h4" || tag === "p" || (tag === "h3" && (scope?.rootEntity || scope?.groupSections))) {
      skip = /Scoreboard Cleanup|점수판 정리|計分板(?:整理|調整)/.test(title);
      const isSubsection = scope?.groupSections && /[:：]$|^(?:Quest Progress|Quest Rewards|퀘스트|任務進度|任務獎勵)/.test(title);
      const sectionTitle = isSubsection && parentSection ? `${parentSection} · ${title}` : title;
      if (!isSubsection) parentSection = title;
      section = { title: sectionTitle, rows: [] }; entity?.sections.push(section);
    }
    if (tag !== "li" && !(tag === "blockquote" && kind === "system")) continue;
    if (skip) { excluded.push(title); continue; }
    if (!entity && kind === "system") { entity = { kind, title: scope!.title, sections: [] }; entities.push(entity); entityHeadingLevel = 2; }
    if (!entity) throw new Error(`Official row has no entity: ${title}`);
    if (!section) { section = { title: "", rows: [] }; entity.sections.push(section); }
    const rows = blockRows(block);
    section.rows.push(...rows); rowCount += rows.length;
  }
  const populated = entities.map(entry => ({ ...entry, sections: entry.sections.filter(group => group.rows.length) }))
    .filter(entry => entry.sections.length);
  if (!rowCount || !populated.some(entry => entry.kind === "champion")) throw new Error("Official champion changes missing");
  return { entities: populated, rowCount, excluded, coverage };
}
