/**
 * 브라우저 상성 코치용 지식 번들
 *
 * 지식 카드는 `knowledge/` 아래에 있어 브라우저가 못 읽는다. 사실 카드와 통계는 이미
 * `public/data/<patch>/` 에 있으므로 여기서는 **지식 계층만** 하나로 묶어 내보낸다.
 *
 * 챔피언마다 파일을 따로 두면 상성 하나에 두 번 받아야 하고, 캐시 무효화도 잘게 쪼개진다.
 * 전체가 2MB 남짓이라 한 파일로 두고 한 번만 받는 편이 낫다.
 *
 * 사용: npm run llm:bundle
 */
import * as fs from "fs";
import * as path from "path";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";
import { loadCuratedTips } from "./lib/knowledge";
import { loadPlaybooks } from "./lib/playbook";
import type { CuratedTip } from "./lib/knowledgeCore";
import type { Playbook, PlaybookEntry } from "./lib/playbookCore";
import type { ChampionCard } from "./lib/facts";
import {
  deriveEscapeClaims,
  deriveItemClaims,
  renderEscapeClaims,
  renderItemClaims,
} from "./lib/claims";
import type { RuleNotes } from "./lib/rules";
import { parseMechanics, type MechanicsIndex } from "./lib/mechanics";

export const ADVISOR_BUNDLE_FILE = "advisor-knowledge.json";

export interface AdvisorKnowledgeBundle {
  schemaVersion: 1;
  patchVersion: string;
  generatedAt: string;
  /** 챔피언 id → 플레이북 */
  playbooks: Record<string, Playbook>;
  /** 상성 한정 팁 */
  tips: CuratedTip[];
  /** 룬·소환사 주문 판정 규칙. 툴팁이 담지 못하는 발동 조건과 예외. */
  rules: RuleNotes[];
  /** 챔피언과 무관한 게임 규칙. 저항·관통 적용 순서, 고정 피해, 스킬 가속 등. */
  mechanics: MechanicsIndex;
  counts: {
    champions: number;
    entries: number;
    tips: number;
    rules: number;
    mechanics: number;
  };
}

/**
 * `generated` 표시가 있는 항목의 본문을 카드에서 지어 넣는다.
 *
 * 자료에서 도출되는 대목은 여기서 만들고, 사람이 적은 `nuance` 한 문장을 뒤에
 * 붙인다. 카드가 없으면(신규 챔피언 등) 만들 수 없으므로 nuance 만 남긴다.
 */
function fillGenerated(entry: PlaybookEntry, card: ChampionCard | undefined): PlaybookEntry {
  if (!entry.generated) return entry;
  const made = !card
    ? ""
    : entry.generated === "situational-item"
      ? renderItemClaims(card, deriveItemClaims(card))
      : renderEscapeClaims(card, deriveEscapeClaims(card));
  const text = [made, entry.nuance].filter(Boolean).join(" ").trim();
  const { generated: _generated, nuance: _nuance, ...rest } = entry;
  return { ...rest, text };
}

function main() {
  const patch = resolvePatchVersion();
  const playbooks = loadPlaybooks();
  const tips = loadCuratedTips();

  const cardFile = path.join(PUBLIC_DATA_ROOT, patch, "llm", "champion-cards-ko_KR.json");
  const cards = new Map(
    (JSON.parse(fs.readFileSync(cardFile, "utf8")) as { cards: ChampionCard[] }).cards.map(
      (card) => [card.id, card] as const,
    ),
  );

  const ruleFile = path.join(PUBLIC_DATA_ROOT, patch, "llm", "rule-notes.json");
  const rules: RuleNotes[] = fs.existsSync(ruleFile)
    ? (JSON.parse(fs.readFileSync(ruleFile, "utf8")) as { rules?: RuleNotes[] }).rules ?? []
    : [];

  // 사람이 쓴 기초 문서를 절 단위로 싣는다. 브라우저가 docs/ 를 못 읽으므로 여기서 옮긴다.
  const mechanicsFile = path.join(process.cwd(), "docs", "lol-fundamentals.md");
  const mechanics: MechanicsIndex = fs.existsSync(mechanicsFile)
    ? parseMechanics(fs.readFileSync(mechanicsFile, "utf8"))
    : [];

  const byChampion: Record<string, Playbook> = {};
  let entries = 0;
  let generated = 0;
  for (const [champion, book] of playbooks) {
    const card = cards.get(champion);
    byChampion[champion] = {
      champion,
      playing: book.playing.map((entry) => fillGenerated(entry, card)),
      against: book.against.map((entry) => fillGenerated(entry, card)),
    };
    generated += [...book.playing, ...book.against].filter((e) => e.generated).length;
    entries += book.playing.length + book.against.length;
  }

  const bundle: AdvisorKnowledgeBundle = {
    schemaVersion: 1,
    patchVersion: patch,
    generatedAt: new Date().toISOString(),
    playbooks: byChampion,
    tips,
    rules,
    mechanics,
    counts: {
      champions: playbooks.size,
      entries,
      tips: tips.length,
      rules: rules.reduce((n, r) => n + r.notes.length, 0),
      mechanics: mechanics.length,
    },
  };

  const out = path.join(PUBLIC_DATA_ROOT, patch, "llm", ADVISOR_BUNDLE_FILE);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(bundle), "utf8");

  const kb = (fs.statSync(out).size / 1024).toFixed(0);
  console.log(
    `생성: ${path.relative(process.cwd(), out)} ` +
      `(챔피언 ${playbooks.size}종, 항목 ${entries}건 중 생성 ${generated}건, 팁 ${tips.length}건, ` +
      `판정 규칙 ${rules.length}종, 메커니즘 ${mechanics.length}절, ${kb} KB)`,
  );
}

main();
