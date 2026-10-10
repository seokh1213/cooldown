import { stripWikiMarkup } from "../lib/luaTable";

export function wikiFields(raw: string): Array<{ key: string; text: string }> {
  const variables = new Map([...raw.matchAll(/\{\{#vardefine:([^|{}]+)\|([\d.]+)\}\}/g)].map(match => [match[1], match[2]]));
  const expanded = raw.replace(/\{\{#var:([^{}]+)\}\}/g, (all, key: string) => variables.get(key) ?? all);
  return expanded.split(/\n(?=\|\w)/).flatMap(field => {
    const match = /^\|(description\d*|leveling\d*|notes|additional|blurb\d*)\s*=([\s\S]*)$/.exec(field);
    if (!match) return [];
    // Timing is sometimes only in an ft/tt hover explanation. Keep both sides.
    let body = match[2];
    for (let pass = 0; pass < 15 && /\{\{/.test(body); pass += 1) {
      const next = body.replace(/\{\{([^{}]*)\}\}/g, (all, inner: string) => {
        const [kind, ...args] = inner.split("|");
        if (kind === "ft" || kind === "tt") return args.slice(0, 2).join(" (") + (args.length > 1 ? ")" : "");
        if (kind === "sti") return args.at(-1) ?? "";
        if (kind.startsWith("#")) return all;
        return stripWikiMarkup(all);
      });
      if (next === body) break;
      body = next;
    }
    return [{ key: match[1], text: stripWikiMarkup(body).replace(/\}\}\s*$/, "") }];
  });
}
