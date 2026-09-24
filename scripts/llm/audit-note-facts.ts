/**
 * 노트 사실 검수 1단계 — 사실 원자를 스킬 툴팁에 맞대 본다(로컬 Bespoke-MiniCheck)
 *
 * 노트는 사람이 썼지만 게임 사실이 틀린 것이 섞여 있었다(말파이트 Q 가 미니언에 막힌다, 1~2레벨은
 * 스킬이 하나뿐 …). 채점자가 짚어야만 알았다. 원자(knowledge/atoms) 중 게임 메커니즘을 말하는
 * fact 원자를 그 챔피언의 영어 툴팁과 맞대 "근거 없음" 을 거른다. 영어로 하는 까닭: 검증 모델이
 * 영어로 배웠다. 원자에 영어 번역이 있다.
 *
 * "근거 없음" 은 틀렸다는 뜻이 아니다 — 툴팁이 말하지 않는 것(게임 규칙, 상호작용)도 여기 걸린다.
 * 그래서 이것은 거르개이고, 걸린 것은 2단계(사람 또는 큰 모델이 위키로 판정)로 넘긴다.
 * 파일럿 14문장(참 7·거짓 7): 거짓 7개를 모두 걸렀고 참 2개를 잘못 걸렀다.
 *
 * 사용: ollama pull bespoke-minicheck:7b-q5_1
 *       npx tsx scripts/llm/audit-note-facts.ts --out research/llm-evals/fact-audit/minicheck.json
 */
import * as fs from "fs";
import * as path from "path";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";
import type { ChampionCard } from "./lib/facts";
import type { AtomFile } from "./build-note-atoms";

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const OUT = arg("out") ?? "research/llm-evals/fact-audit/minicheck.json";
const MODEL = arg("model") ?? "bespoke-minicheck:7b-q5_1";
const KINDS = new Set((arg("kinds") ?? "fact").split(","));
const HOST = process.env.OLLAMA_HOST?.startsWith("http") ? process.env.OLLAMA_HOST : "http://127.0.0.1:11434";

const patch = resolvePatchVersion();
const cards = new Map(
  (JSON.parse(fs.readFileSync(path.join(PUBLIC_DATA_ROOT, patch, "llm", "champion-cards-en_US.json"), "utf8")) as { cards: ChampionCard[] }).cards.map(
    (card) => [card.id, card],
  ),
);

/** 근거 문서: 원자가 부른 스킬의 툴팁. 부른 스킬이 없으면 스킬 전부. */
function evidence(card: ChampionCard, slots: string[]): string {
  const spells = card.spells.filter((spell) => !slots.length || slots.includes(spell.slot));
  return spells.map((spell) => `${card.name} ${spell.slot} (${spell.name}): ${spell.text || spell.summary}`).join("\n");
}

async function check(document: string, claim: string): Promise<boolean> {
  const res = await fetch(`${HOST}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content: `Document: ${document}\nClaim: ${claim}` }], stream: false, options: { temperature: 0 } }),
  });
  const data = (await res.json()) as { message: { content: string } };
  return /^yes/i.test(data.message.content.trim());
}

async function main() {
  const dir = path.join(process.cwd(), "knowledge", "atoms");
  const rows: Array<{ id: string; champion: string; source: string; skills: string[]; ko: string; en: string; supported: boolean }> = [];
  const todo: Array<() => Promise<void>> = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    const atomFile = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")) as AtomFile;
    const card = cards.get(atomFile.champion);
    if (!card) continue;
    for (const atom of atomFile.atoms) {
      const text = atom.text as Record<string, string | undefined>;
      if (!KINDS.has(atom.kind) || !atom.source.startsWith("playbook:") || !text.en_US) continue;
      // 원자는 주어를 흔히 뺀다("E empowers …"). 누구의 이야기인지 붙인다.
      const claim = text.en_US.includes(card.name) ? text.en_US : `${card.name}: ${text.en_US}`;
      todo.push(async () => {
        const supported = await check(evidence(card, atom.skills ?? []), claim);
        rows.push({ id: atom.id, champion: card.id, source: atom.source, skills: atom.skills ?? [], ko: text.ko ?? "", en: claim, supported });
      });
    }
  }
  const started = Date.now();
  let next = 0;
  await Promise.all(
    Array.from({ length: 2 }, async () => {
      while (next < todo.length) {
        await todo[next++]();
        if (rows.length % 50 === 0) console.log(`${rows.length}/${todo.length} · ${Math.round((Date.now() - started) / 1000)}s`);
      }
    }),
  );
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(rows, null, 2));
  const flagged = rows.filter((r) => !r.supported).length;
  console.log(`원자 ${rows.length} · 근거 없음 ${flagged} (${Math.round((flagged / rows.length) * 100)}%) · ${Math.round((Date.now() - started) / 1000)}s`);
}

main();
