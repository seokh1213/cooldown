import assert from "node:assert/strict";
import { FORMULA_GROUPS } from "../src/data/gameFormulas";
import { translations } from "../src/i18n/translations";

const ALLOWED_SHARED_TEXT = new Set([
  "nav.language.korean",
  "nav.language.english",
  "nav.language.chinese",
  "encyclopedia.vs",
]);

function collectSharedLeaves(
  english: unknown,
  chinese: unknown,
  path: string[] = [],
): string[] {
  if (typeof english === "string" && typeof chinese === "string") {
    const key = path.join(".");
    return english === chinese && !ALLOWED_SHARED_TEXT.has(key) ? [key] : [];
  }
  if (!english || !chinese || typeof english !== "object" || typeof chinese !== "object") {
    return [];
  }
  return Object.keys(english).flatMap((key) => collectSharedLeaves(
    Reflect.get(english, key),
    Reflect.get(chinese, key),
    [...path, key],
  ));
}

const sharedLeaves = collectSharedLeaves(translations.en_US, translations.zh_CN);
assert.deepEqual(sharedLeaves, [], `Chinese UI still falls back to English: ${sharedLeaves.join(", ")}`);
assert.equal(translations.zh_CN.comparison.copySuccess, "已复制当前对位的链接。");
assert.equal(translations.zh_CN.skillTooltip.scalingsTitle, "加成");

/*
 * 영어·중국어 자리에 한글이 남아 있으면 잡는다.
 *
 * 번역 파일은 빠진 것을 위에서 잡지만, 화면 글이 번역 파일 밖에도 있다. 수치 공식
 * 표(`FORMULA_GROUPS`)의 계산식이 그랬다 — 타입에는 "언어와 무관하다" 고 적어 두고
 * 스물여섯 줄을 전부 한국어로 써서, 영어 화면에 이런 것이 그대로 나왔다.
 *
 *   받는 피해 = 원래 피해 × 100 / (100 + 저항력)
 *
 * 같은 일이 다시 생기지 않게, 세 언어를 담는 자리를 통째로 훑는다.
 */
const HANGUL = /[가-힣]/;
const leaked: string[] = [];
function walkLocalized(value: unknown, path: string[]): void {
  if (!value || typeof value !== "object") return;
  const record = value as Record<string, unknown>;
  if (typeof record.ko_KR === "string" && typeof record.en_US === "string" && typeof record.zh_CN === "string") {
    for (const locale of ["en_US", "zh_CN"] as const) {
      const text = record[locale] as string;
      if (HANGUL.test(text)) leaked.push(`${path.join(".")}.${locale}: ${text.slice(0, 40)}`);
    }
    return;
  }
  for (const [key, child] of Object.entries(record)) walkLocalized(child, [...path, key]);
}
walkLocalized(FORMULA_GROUPS, ["FORMULA_GROUPS"]);
assert.deepEqual(leaked.slice(0, 5), [], `영어·중국어 자리에 한글이 남아 있다 ${leaked.length}건`);

console.log(`✅ Chinese UI translation coverage passed (수치 공식 ${FORMULA_GROUPS.reduce((n, g) => n + g.entries.length, 0)}항 포함)`);
