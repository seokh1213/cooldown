/**
 * 미리 쓴 상성 답 은행을 코드로 훑는다 — 채점에서 깎인 약점이 은행 전체에 얼마나 퍼져 있는지
 *
 *   빈칸      키가 비었거나 없음
 *   한 문장   2~4문장을 시켰는데 한 문장뿐(코드 규칙이 문장을 버린 흔적이기도 하다)
 *   끊긴 첫머리  "그때", "이 틈에" 처럼 앞말을 가리키는 말로 시작(앞 문장이 버려진 흔적)
 *   아이템 이름  build 칸에 아이템 이름이 하나도 없음 — 재료에 이름이 있었는지도 함께 본다
 *   순서      combo 칸에 순서 표시(→, 먼저, 이어, 뒤, 순서)가 없음
 *   시점      escape·fight 칸에 시점 낱말(직후, 빠진, 쿨타임, 레벨 …)이 없음
 *
 * 사용: npx tsx scripts/llm/audit-precomputed.ts [out.json]
 */
import * as fs from "fs";
import * as path from "path";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";
import { material, SECTION_KEYS } from "./precompute-matchups";
import type { ChampionCard } from "./lib/facts";

const patch = resolvePatchVersion();
const dir = path.join(PUBLIC_DATA_ROOT, patch, "llm", "matchups");
const cards = (JSON.parse(fs.readFileSync(path.join(PUBLIC_DATA_ROOT, patch, "llm/champion-cards-ko_KR.json"), "utf8")) as { cards: ChampionCard[] }).cards;
const byId = new Map(cards.map((c) => [c.id, c]));
const items = (JSON.parse(fs.readFileSync(path.join(PUBLIC_DATA_ROOT, patch, "items-normalized-ko_KR.json"), "utf8")) as { items: Array<{ name: string }> }).items
  .map((i) => i.name)
  .filter((n) => n && n.length >= 3);
const itemRe = new RegExp(items.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).sort((a, b) => b.length - a.length).join("|"));

const DANGLING = /^(그때|그 때|이때|이 틈에|그 틈에|그 사이|그 순간|그 뒤|그다음|그러면|그래서|이후|또한|다만)/;
const ORDER = /→|먼저|이어|뒤에|다음|순서|곧바로|직후/;
const TIMING = /직후|빠진|빠졌|빠지면|쿨타임|재사용|레벨|동안|순간|시점|끝난|뒤에|전에|이후/;
const sentences = (t: string) => t.split(/(?<=[.!?])\s+/).filter(Boolean);

const stat: Record<string, Record<string, number>> = {};
const bump = (key: string, what: string) => ((stat[key] ??= {})[what] = (stat[key]?.[what] ?? 0) + 1);
const examples: Record<string, string[]> = {};
const ex = (what: string, s: string) => (examples[what] ??= []).length < 5 && examples[what].push(s);
let pairs = 0;
let buildNoItemButMaterialHas = 0;

for (const file of fs.readdirSync(dir).filter((f) => /^[A-Za-z]+\.json$/.test(f))) {
  const me = file.replace(".json", "");
  const bank = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as { pairs: Record<string, Record<string, string>> };
  for (const [enemy, pair] of Object.entries(bank.pairs)) {
    pairs += 1;
    for (const key of SECTION_KEYS) {
      const text = (pair[key] ?? "").trim();
      bump(key, "total");
      if (!text) {
        bump(key, "빈칸");
        continue;
      }
      const s = sentences(text);
      if (s.length === 1) bump(key, "한 문장");
      if (DANGLING.test(text)) {
        bump(key, "끊긴 첫머리");
        ex("끊긴 첫머리", `${me}:${enemy} [${key}] ${text.slice(0, 80)}`);
      }
      if (key === "build" && !itemRe.test(text)) {
        bump(key, "아이템 이름 없음");
        const m = byId.get(me) && byId.get(enemy) ? material(byId.get(me)!, byId.get(enemy)!) : "";
        if (itemRe.test(m)) {
          buildNoItemButMaterialHas += 1;
          ex("아이템 이름 없음(재료엔 있음)", `${me}:${enemy} ${text.slice(0, 90)} ‖ 재료: ${m.match(itemRe)?.[0]}`);
        }
      }
      if (key === "combo" && !ORDER.test(text)) {
        bump(key, "순서 표시 없음");
        ex("순서 표시 없음", `${me}:${enemy} ${text.slice(0, 90)}`);
      }
      if ((key === "escape" || key === "fight") && !TIMING.test(text)) bump(key, "시점 낱말 없음");
    }
  }
}

const rate = (key: string, what: string) => `${stat[key]?.[what] ?? 0} (${(((stat[key]?.[what] ?? 0) / (stat[key]?.total ?? 1)) * 100).toFixed(1)}%)`;
console.log(`쌍 ${pairs}`);
for (const key of SECTION_KEYS) {
  const kinds = Object.keys(stat[key] ?? {}).filter((k) => k !== "total");
  console.log(`${key.padEnd(10)} ${kinds.map((k) => `${k} ${rate(key, k)}`).join(" · ")}`);
}
console.log(`build 아이템 이름 없음 중 재료에는 이름이 있던 쌍: ${buildNoItemButMaterialHas}`);
for (const [k, v] of Object.entries(examples)) console.log(`\n[${k}]\n${v.map((x) => `  ${x}`).join("\n")}`);
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ pairs, stat, buildNoItemButMaterialHas, examples }, null, 1));
