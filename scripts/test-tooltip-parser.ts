/**
 * Tooltip Parser 테스트 스크립트
 * npm run test-tooltip으로 실행
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSpellTooltip } from "../src/lib/spellTooltipParser";
import type { ChampionSpell } from "../src/types";
import type { CommunityDragonSpellData } from "../src/lib/spellTooltipParser/types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 테스트 케이스 정의
interface TestCase {
  name: string;
  tooltip: string;
  spell?: ChampionSpell;
  communityDragonData?: CommunityDragonSpellData;
  lang?: "ko_KR" | "en_US";
  expectedContains?: string[];
  expectedNotContains?: string[];
  /**
   * 커스텀 검증 로직
   * - 반환된 배열에 에러 메시지를 넣으면 해당 테스트가 실패로 처리됨
   */
  assert?: (result: string) => string[];
}

const testCases: TestCase[] = [
  {
    name: "기본 변수 치환 테스트",
    tooltip: "데미지: {{ e1 }}",
    spell: {
      id: "TestSpell",
      name: "Test Spell",
      description: "",
      tooltip: "데미지: {{ e1 }}",
      maxrank: 5,
      cooldown: [10, 9, 8, 7, 6],
      cooldownBurn: "10/9/8/7/6",
      cost: [50, 50, 50, 50, 50],
      costBurn: "50",
      effectBurn: [null, "50", "100", "150", "200", "250"],
      range: [600],
      rangeBurn: "600",
    },
    expectedContains: ["50"],
  },
  {
    name: "레벨별 값 표시 테스트",
    tooltip: "데미지: {{ e1 }}",
    spell: {
      id: "TestSpell",
      name: "Test Spell",
      description: "",
      tooltip: "데미지: {{ e1 }}",
      maxrank: 5,
      cooldown: [10, 9, 8, 7, 6],
      cooldownBurn: "10/9/8/7/6",
      cost: [50, 50, 50, 50, 50],
      costBurn: "50",
      effectBurn: [null, "50/60/70/80/90", "100/110/120/130/140"],
      range: [600],
      rangeBurn: "600",
    },
    expectedContains: ["50/60/70/80/90"],
  },
  {
    name: "XML 태그 변환 테스트",
    tooltip: "<mainText>데미지: {{ e1 }}</mainText>",
    spell: {
      id: "TestSpell",
      name: "Test Spell",
      description: "",
      tooltip: "<mainText>데미지: {{ e1 }}</mainText>",
      maxrank: 5,
      cooldown: [10],
      cooldownBurn: "10",
      cost: [50],
      costBurn: "50",
      effectBurn: [null, "100"],
      range: [600],
      rangeBurn: "600",
    },
    expectedContains: ["데미지"],
    expectedNotContains: ["<mainText>"],
  },
  {
    name: "빈 툴팁 처리",
    tooltip: "",
    expectedContains: [""],
  },
  {
    name: "undefined 툴팁 처리",
    tooltip: undefined as any,
    expectedContains: [""],
  },
];

interface VersionInfo {
  version: string;
  ddragonVersion?: string;
  cdragonVersion?: string | null;
}

async function loadDataRootAndVersion(): Promise<{
  dataRoot: string;
  dataVersion: string;
}> {
  const dataRoot = path.resolve(__dirname, "../public/data");
  const versionRaw = await fs.readFile(path.join(dataRoot, "version.json"), "utf-8");
  const versionInfo = JSON.parse(versionRaw) as VersionInfo;
  const dataVersion = versionInfo.ddragonVersion ?? versionInfo.version;
  return { dataRoot, dataVersion };
}

async function buildRealDataTestCases(): Promise<TestCase[]> {
  const champions = ["KSante", "Ryze", "Galio"] as const;
  const cases: TestCase[] = [];

  let dataRoot: string;
  let dataVersion: string;

  try {
    ({ dataRoot, dataVersion } = await loadDataRootAndVersion());
  } catch (error) {
    console.warn("⚠️  version.json을 읽지 못해 실데이터 기반 테스트를 건너뜁니다.", error);
    return cases;
  }

  for (const championId of champions) {
    const championPath = path.join(
      dataRoot,
      dataVersion,
      "champions",
      `${championId}-ko_KR.json`
    );
    const spellsPath = path.join(
      dataRoot,
      dataVersion,
      "spells",
      `${championId}.json`
    );

    let championRaw: string;
    let spellsRaw: string;

    try {
      [championRaw, spellsRaw] = await Promise.all([
        fs.readFile(championPath, "utf-8"),
        fs.readFile(spellsPath, "utf-8"),
      ]);
    } catch (error) {
      console.warn(`⚠️  ${championId} 실데이터 파일을 읽지 못해 해당 챔피언 테스트를 건너뜁니다.`, error);
      continue;
    }

    const championJson = JSON.parse(championRaw) as {
      champion: { spells?: ChampionSpell[] };
    };
    const spellsJson = JSON.parse(spellsRaw) as {
      spellData?: Record<string, any>;
    };

    const spells = championJson.champion.spells ?? [];
    const spellDataMap = spellsJson.spellData ?? {};

    spells.forEach((spell, index) => {
      const tooltip = spell.tooltip ?? "";
      if (!tooltip) return;

      const cdEntry =
        spellDataMap[String(index)] ??
        spellDataMap[spell.id] ??
        undefined;

      const communityDragonData: CommunityDragonSpellData | undefined = cdEntry
        ? {
            DataValues: cdEntry.DataValues,
            mSpellCalculations: cdEntry.mSpellCalculations,
            // effectBurn은 DDragon에서 가져온 값을 그대로 사용
            effectBurn: spell.effectBurn,
          }
        : undefined;

      cases.push({
        name: `[실데이터] ${championId} ${spell.id} (${index})`,
        tooltip,
        spell,
        communityDragonData,
        lang: "ko_KR",
        expectedNotContains: ["{{", "}}"],
        assert: (result: string) => {
          const errors: string[] = [];
          if (!result || result.trim().length === 0) {
            errors.push("툴팁 결과가 비어 있습니다.");
          }
          if (result.includes("{{") || result.includes("}}")) {
            errors.push("치환되지 않은 {{ }} 변수가 남아 있습니다.");
          }
          return errors;
        },
      });
    });
  }

  return cases;
}

async function runTests() {
  console.log("=== Tooltip Parser 테스트 시작 ===\n");

  let passed = 0;
  let failed = 0;

  const realDataCases = await buildRealDataTestCases();
  const allCases: TestCase[] = [...testCases, ...realDataCases];

  for (const testCase of allCases) {
    try {
      const result = parseSpellTooltip(
        testCase.tooltip,
        testCase.spell,
        testCase.communityDragonData,
        testCase.lang || "ko_KR"
      );

      let testPassed = true;
      const errors: string[] = [];

      // expectedContains 검증
      if (testCase.expectedContains) {
        for (const expected of testCase.expectedContains) {
          if (!result.includes(expected)) {
            testPassed = false;
            errors.push(`예상된 문자열 "${expected}"을 찾을 수 없습니다.`);
          }
        }
      }

      // expectedNotContains 검증
      if (testCase.expectedNotContains) {
        for (const notExpected of testCase.expectedNotContains) {
          if (result.includes(notExpected)) {
            testPassed = false;
            errors.push(`예상치 못한 문자열 "${notExpected}"이 포함되어 있습니다.`);
          }
        }
      }

      // 커스텀 검증 로직
      if (testCase.assert) {
        const customErrors = testCase.assert(result);
        if (customErrors.length > 0) {
          testPassed = false;
          errors.push(...customErrors);
        }
      }

      if (testPassed) {
        console.log(`✅ ${testCase.name}`);
        passed++;
      } else {
        console.log(`❌ ${testCase.name}`);
        console.log(`   결과: ${result.substring(0, 100)}...`);
        errors.forEach((error) => console.log(`   - ${error}`));
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${testCase.name}`);
      console.log(`   에러: ${error instanceof Error ? error.message : String(error)}`);
      failed++;
    }
  }

  console.log(`\n=== 테스트 완료 ===`);
  console.log(`통과: ${passed}, 실패: ${failed}, 총: ${testCases.length}`);

  if (failed > 0) {
    console.log("\n⚠️  일부 테스트가 실패했습니다.");
    process.exit(1);
  } else {
    console.log("\n✅ 모든 테스트가 통과했습니다!");
    process.exit(0);
  }
}
runTests().catch((error) => {
  console.error("❌ 테스트 실행 중 예기치 못한 에러가 발생했습니다.", error);
  process.exit(1);
});

