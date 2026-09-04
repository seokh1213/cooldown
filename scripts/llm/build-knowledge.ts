/**
 * 챔피언 사실 카드 일괄 생성
 *
 * 출력: public/data/<patch>/llm/champion-cards-<lang>.json
 *  - 웹(web-llm) 단계에서 이 파일만 fetch 하면 CLI 와 동일한 컨텍스트를 만들 수 있다.
 *  - 본문(스킬 툴팁 평문)까지 포함해도 챔피언당 수 KB 수준.
 *
 * 사용: npm run llm:build [-- --lang ko_KR]
 */
import * as fs from "fs";
import * as path from "path";
import { loadStaticData, PUBLIC_DATA_ROOT, type LlmLocale } from "./lib/data";
import { createChampionCardBuilder, type ChampionCard } from "./lib/facts";

export interface ChampionCardFile {
  schemaVersion: 1;
  patch: string;
  lang: LlmLocale;
  generatedAt: string;
  cards: ChampionCard[];
}

function parseLang(argv: string[]): LlmLocale {
  const idx = argv.indexOf("--lang");
  return (idx >= 0 ? argv[idx + 1] : "ko_KR") as LlmLocale;
}

function main() {
  const lang = parseLang(process.argv.slice(2));
  const data = loadStaticData(lang);
  const builder = createChampionCardBuilder(data.champions);
  const cards = builder.buildAll();

  const outDir = path.join(PUBLIC_DATA_ROOT, data.patch, "llm");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `champion-cards-${lang}.json`);
  const file: ChampionCardFile = {
    schemaVersion: 1,
    patch: data.patch,
    lang,
    generatedAt: new Date().toISOString(),
    cards,
  };
  fs.writeFileSync(outFile, JSON.stringify(file), "utf8");

  // 요약 통계
  const effectCount = new Map<string, number>();
  const primaryCount = new Map<string, number>();
  let withoutDdragon = 0;
  for (const card of cards) {
    for (const m of card.mechanics) effectCount.set(m, (effectCount.get(m) ?? 0) + 1);
    primaryCount.set(card.damageProfile.primary, (primaryCount.get(card.damageProfile.primary) ?? 0) + 1);
    if (card.roleTags.length === 0) withoutDdragon += 1;
  }
  const size = fs.statSync(outFile).size;
  console.log(`생성: ${path.relative(process.cwd(), outFile)} (${cards.length} 챔피언, ${(size / 1024).toFixed(0)} KB)`);
  console.log(`주 피해 유형 분포: ${Array.from(primaryCount, ([k, v]) => `${k} ${v}`).join(", ")}`);
  if (withoutDdragon) console.log(`ddragon 보조 데이터 부재 챔피언: ${withoutDdragon}`);
  console.log("효과 태그 빈도:");
  for (const [label, n] of Array.from(effectCount).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${label.padEnd(18)} ${n}`);
  }
}

main();
