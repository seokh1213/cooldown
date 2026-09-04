import assert from "node:assert/strict";
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
assert.equal(translations.zh_CN.pages.simulation.lethalLabel, "可以击杀");
assert.equal(translations.zh_CN.skillTooltip.scalingsTitle, "加成");

console.log("✅ Chinese UI translation coverage passed");
