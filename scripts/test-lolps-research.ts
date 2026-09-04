import assert from "node:assert/strict";
import { localeConfigs } from "./lolps-research-sources";
import { descriptionBody, jaccard } from "./lolps-research-utils";

assert.deepEqual(
  localeConfigs.map(({ locale, lolpsSuffix, cdragonLocale }) => ({
    locale,
    lolpsSuffix,
    cdragonLocale,
  })),
  [
    { locale: "en_US", lolpsSuffix: "Us", cdragonLocale: "default" },
    { locale: "ko_KR", lolpsSuffix: "Kr", cdragonLocale: "ko_kr" },
    { locale: "zh_CN", lolpsSuffix: "Cn", cdragonLocale: "zh_cn" },
  ]
);

assert.equal(
  descriptionBody("造成100魔法伤害。<br>技能消耗:60<br>技能冷却(秒):9", "zh_CN"),
  "造成100魔法伤害。"
);
assert.equal(jaccard("造成魔法伤害", "造成魔法伤害"), 1);
assert.ok(jaccard("造成魔法伤害", "获得移动速度") < 0.2);

console.log("lol.ps 다국어 연구 유틸리티 테스트 통과");
