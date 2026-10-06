import { createHash } from "node:crypto";

export const WIKI_API = "https://wiki.leagueoflegends.com/en-us/api.php";
export const SITEMAP = "https://www.leagueoflegends.com/en-us/sitemap_loc.xml";
export interface Source { id: string; kind: "wiki" | "official" | "cdragon"; url: string; title?: string }
export interface Snapshot { id: string; kind: Source["kind"]; url: string; hash: string; revision?: number }
export const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

export async function getText(url: string): Promise<string> {
  const response = await fetch(url, { headers: { "User-Agent": "cooldown-knowledge/1.0 (source monitoring)" }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.text();
}

export function officialPatches(xml: string): Array<{ patch: string; url: string }> {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].flatMap(([, url]) => {
    const match = url.match(/^https:\/\/www\.leagueoflegends\.com\/en-us\/news\/game-updates\/(?:league-of-legends-)?patch-(\d+)-(\d+)-notes\/?$/);
    return match ? [{ patch: `${Number(match[1])}.${Number(match[2])}`, url }] : [];
  }).sort((a, b) => {
    const [ay, an] = a.patch.split(".").map(Number);
    const [by, bn] = b.patch.split(".").map(Number);
    return ay - by || an - bn;
  });
}

export function wikiGameplay(html: string): string {
  const boundary = html.search(/(?:id|id\s*)="(?:Trivia|Strategy|Sound_Effects|Patch_History|References|See_Also)"/i);
  const heading = boundary < 0 ? -1 : html.lastIndexOf("<h", boundary);
  return (boundary < 0 ? html : html.slice(0, heading < 0 ? boundary : heading))
    .replace(/<!--[\s\S]*?-->/g, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/\s+/g, " ").trim();
}

function articleHtml(value: unknown): string | undefined {
  if (typeof value === "string") return value.includes('<div id="patch-notes-container"') ? value : undefined;
  if (!value || typeof value !== "object") return undefined;
  for (const child of Object.values(value)) {
    const article = articleHtml(child);
    if (article) return article;
  }
  return undefined;
}

function articleContent(html: string): string | undefined {
  const data = html.match(/<script[^>]+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (!data) return undefined;
  return articleHtml(JSON.parse(data));
}

export function officialBody(html: string): string {
  const embedded = articleContent(html);
  if (embedded) return embedded.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const match = html.match(/<div[^>]*id="patch-notes-container"[^>]*>/);
  const start = match?.index;
  if (start === undefined) throw new Error("Official patch article body not found");
  // 노트 HTML을 JSON 문자열로 다시 넣은 Next.js 데이터와 사이트 공통 footer는 제외한다.
  const end = html.indexOf("</main>", start);
  if (end < start) throw new Error("Official patch article boundary not found");
  return html.slice(start, end).split("<footer")[0]
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export async function collectSource(source: Source): Promise<{ snapshot: Snapshot; raw: string }> {
  if (source.kind === "wiki") {
    const params = new URLSearchParams({ action: "parse", page: source.title!, prop: "text|wikitext|revid|templates", redirects: "1", format: "json", formatversion: "2" });
    const raw = await getText(`${WIKI_API}?${params}`);
    const data = JSON.parse(raw) as { parse?: { text: string; wikitext: string; revid: number }; error?: { code: string } };
    if (!data.parse?.text || !data.parse.wikitext || !data.parse.revid) throw new Error(`Wiki content missing: ${source.title}`);
    const content = { raw: data.parse.wikitext, gameplay: wikiGameplay(data.parse.text) };
    return { snapshot: { ...source, hash: sha256(JSON.stringify(content)), revision: data.parse.revid }, raw };
  }
  const raw = await getText(source.url);
  const normalized = source.kind === "official" ? officialBody(raw) : JSON.stringify(JSON.parse(raw));
  return { snapshot: { ...source, hash: sha256(normalized) }, raw };
}

export function diffSnapshots(baseline: Snapshot[], current: Snapshot[]) {
  const before = new Map(baseline.map(snapshot => [snapshot.id, snapshot]));
  return current.flatMap(snapshot => {
    const previous = before.get(snapshot.id);
    if (!previous) return [{ id: snapshot.id, change: "added", url: snapshot.url }];
    return previous.hash === snapshot.hash ? [] : [{ id: snapshot.id, change: "changed", url: snapshot.url }];
  });
}
