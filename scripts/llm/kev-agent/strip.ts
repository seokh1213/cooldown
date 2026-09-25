/** 문항에서 챔피언 이름(과 붙은 조사·전치사)만 지운다. 이어 묻기를 새로 쓰지 않고 있는 문항에서 얻는다. */
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const llm = path.join(ROOT, "public/data/26.19/llm");
const names = (JSON.parse(fs.readFileSync(path.join(llm, "champion-names.json"), "utf8")) as { names: Record<string, string[]> }).names;
const cardName: Record<string, Record<string, string>> = {};
for (const lang of ["ko_KR", "en_US", "zh_CN"]) {
  const cards = (JSON.parse(fs.readFileSync(path.join(llm, `champion-cards-${lang}.json`), "utf8")) as { cards: Array<{ id: string; name: string }> }).cards;
  for (const c of cards) (cardName[c.id] ??= {})[lang] = c.name;
}


export const idByName = new Map<string, string>();
for (const [id, byLang] of Object.entries(cardName)) for (const n of Object.values(byLang)) idByName.set(n, id);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** 이름과 거기 붙은 조사·전치사를 지운다. 못 지우면 undefined. */
export function strip(c: { lang: string; question: string; champions: string[] }): string | undefined {
  let text = c.question;
  for (const id of c.champions) {
    const forms = [...new Set([...(names[id] ?? []), ...Object.values(cardName[id] ?? {}), id])].sort((a, b) => b.length - a.length);
    const form = forms.find((f) => text.toLowerCase().includes(f.toLowerCase()));
    if (!form) return undefined;
    const f = escape(form);
    const patterns =
      c.lang === "ko_KR"
        ? [new RegExp(`${f}\\s*(상대로|상대할\\s*때|상대|으로|로|한테|에게|이랑|랑|은|는|이|가|을|를|의)?\\s*`, "i")]
        : c.lang === "en_US"
          ? [new RegExp(`\\b(against|versus|vs\\.?|into|as|on|with|playing|play|beat|face|facing)\\s+${f}('s)?\\b\\s*`, "i"), new RegExp(`\\b${f}('s)?\\b\\s*`, "i")]
          : [new RegExp(`(用|玩|对上|对线|对|打|碰到|遇到)?${f}(的)?`)];
    const before = text;
    for (const p of patterns) {
      if (p.test(text)) {
        text = text.replace(p, (_m, lead) => (c.lang === "en_US" && /^(beat|face|facing)$/i.test(lead ?? "") ? `${lead} them ` : ""));
        break;
      }
    }
    if (text === before) return undefined;
  }
  text = text.replace(/\s+/g, " ").replace(/^\s*[,?]\s*/, "").trim();
  return text.length >= 3 ? text : undefined;
}

