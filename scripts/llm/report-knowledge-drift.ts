/**
 * 지식 계층이 얼마나 낡았는지 한 장으로 적는다
 *
 * 리워크처럼 **틀렸다고 단정할 수 있는 것**은 시험이 멈춘다(`test-champion-drift`).
 * 여기서 다루는 것은 그 아래다. 틀렸다고 단정할 수는 없지만 사람이 봐야 하는 것들.
 *
 *   문구 변동     라이엇이 설명을 다듬었다. 노트가 여전히 맞는지는 읽어 봐야 안다.
 *   보정 어긋남   보정을 적을 때 본 문구가 바뀌었다.
 *   노트 미작성   도출 노트는 나오지만 사람이 쓴 것이 없다.
 *   남은 구멍     효과 태그가 비었는데 "비었음" 이라고 확인하지도 않은 자리.
 *
 * 이런 것으로 빌드를 멈추면 곧 아무도 안 보게 되고, 그러면 정작 멈춰야 할 때도
 * 안 보게 된다. 그래서 멈추지 않고 **적어 둔다**. 적을 것이 있으면 나가는 글이
 * 있고, 없으면 아무것도 안 나간다.
 *
 * 사용: npm run llm:drift-report
 */
import * as fs from "fs";
import * as path from "path";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";
import type { ChampionCard } from "./lib/facts";
import { fingerprint, loadFingerprints, spellNameLine } from "./lib/championFingerprint";
import { digestSpellText, loadSpellOverrides } from "./lib/spellOverrides";
import { loadPlaybooks } from "./lib/playbook";

const patch = resolvePatchVersion();
const llmDir = path.join(PUBLIC_DATA_ROOT, patch, "llm");
const cards = (
  JSON.parse(fs.readFileSync(path.join(llmDir, "champion-cards-ko_KR.json"), "utf8")) as { cards: ChampionCard[] }
).cards;
const byId = new Map(cards.map((c) => [c.id, c]));

const rows = loadFingerprints();
const overrides = loadSpellOverrides();
const playbooks = loadPlaybooks();

const reworked: string[] = [];
const reworded: string[] = [];
const unstamped: string[] = [];
const unwritten: string[] = [];

for (const card of cards) {
  const book = playbooks.get(card.id);
  const notes = book ? book.playing.length + book.against.length : 0;
  if (notes === 0) unwritten.push(card.name);

  const seen = rows[card.id];
  if (!seen) {
    unstamped.push(card.name);
    continue;
  }
  const now = fingerprint(card, patch);
  if (now.names !== seen.names) {
    reworked.push(`| ${card.name} | \`${seen.spells}\` → \`${spellNameLine(card)}\` | ${notes} |`);
  } else if (now.text !== seen.text) {
    reworded.push(`| ${card.name} | ${notes} | \`npm run llm:stamp -- ${card.id}\` |`);
  }
}

const staleOverrides: string[] = [];
for (const [key, override] of Object.entries(overrides)) {
  const [championId, slot] = key.split(":");
  const spell = byId.get(championId)?.spells.find((s) => s.slot === slot);
  if (!spell || !override.textDigest) continue;
  const now = digestSpellText(spell.text);
  if (now !== override.textDigest) {
    staleOverrides.push(`| \`${key}\` | ${spell.name} | ${override.why} | \`${now}\` |`);
  }
}

/** 효과 태그가 비었는데 "정말 비었다" 고 확인하지도 않은 자리 */
const openGaps: string[] = [];
for (const card of cards) {
  for (const spell of card.spells) {
    const seen = overrides[`${card.id}:${spell.slot}`];
    if (spell.effects.length === 0 && !seen?.confirmedEmpty) {
      openGaps.push(`${card.name} ${spell.slot}`);
    }
  }
}

const out: string[] = [];
const section = (title: string, header: string, lines: string[]) => {
  if (lines.length === 0) return;
  out.push(`### ${title} ${lines.length}건\n`, header, lines.join("\n"), "");
};

section(
  "리워크 의심 — 스킬 이름이 바뀜",
  "| 챔피언 | 이름 변동 | 다시 읽을 노트 |\n|---|---|---|",
  reworked,
);
section(
  "툴팁 문구가 바뀜 — 노트를 읽어 볼 것",
  "| 챔피언 | 노트 | 확인 뒤 |\n|---|---|---|",
  reworded,
);
section(
  "보정을 적을 때 본 문구가 바뀜",
  "| 자리 | 스킬 | 적어 둔 사유 | 새 지문 |\n|---|---|---|---|",
  staleOverrides,
);
if (unstamped.length) out.push(`### 지문이 없는 챔피언 ${unstamped.length}종\n`, unstamped.join(", "), "");
if (unwritten.length) out.push(`### 사람이 쓴 노트가 없는 챔피언 ${unwritten.length}종\n`, unwritten.join(", "), "");
if (openGaps.length) out.push(`### 효과 태그가 비었고 확인도 안 된 자리 ${openGaps.length}곳\n`, openGaps.join(", "), "");

const body = out.length
  ? [`판올림 \`${patch}\` 기준으로 지식 계층에서 사람이 봐야 할 것이 있습니다.\n`, ...out].join("\n")
  : "";

if (body) {
  console.log(body);
} else {
  console.log(`판올림 ${patch} · 봐야 할 것 없음`);
}

// CI 에서는 실행 요약에도 적고, 낼 글이 있는지 뒤 단계에 알린다.
const summary = process.env.GITHUB_STEP_SUMMARY;
if (summary) fs.appendFileSync(summary, `## 지식 계층 점검\n\n${body || "봐야 할 것 없음"}\n`);
const output = process.env.GITHUB_OUTPUT;
if (output) {
  fs.appendFileSync(output, `has_report=${body ? "true" : "false"}\n`);
  fs.writeFileSync("knowledge-drift-report.md", body, "utf8");
}
