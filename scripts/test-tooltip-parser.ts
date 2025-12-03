/**
 * Tooltip Parser 테스트 스크립트
 * npm run test-tooltip으로 실행
 */

import { parseSpellTooltip } from "../src/lib/spellTooltipParser";
import type { ChampionSpell } from "../src/types";
import type { CommunityDragonSpellData } from "../src/lib/spellTooltipParser/types";

// 테스트 케이스 정의
interface TestCase {
  name: string;
  tooltip: string;
  spell?: ChampionSpell;
  communityDragonData?: CommunityDragonSpellData;
  lang?: "ko_KR" | "en_US";
  expectedContains?: string[];
  expectedNotContains?: string[];
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

function runTests() {
  console.log("=== Tooltip Parser 테스트 시작 ===\n");

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
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

runTests();

