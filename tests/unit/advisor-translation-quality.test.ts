import assert from "node:assert/strict";
import test from "node:test";
import { detectStat, detectStats } from "../../src/lib/advisor/statQuery";
import { checkMatchupFacts, checkedMatchupText } from "../../src/lib/advisor/matchupFactCheck";
import { matchupSidesDetailed } from "../../src/lib/advisor/matchupSides";

test("English matchup perspective is not the attack-speed abbreviation", () => {
  for (const question of [
    "As Ahri, give me matchup tips against Zed",
    "As Aatrox, how should I lane against Fiora?",
    "As Nasus, how should I lane against Akali?",
    "As Ahri",
    "as Aatrox",
    "  As Ahri versus Zed",
    "how do i lane vs zed as ahri",
    "Nocturne keeps catching me alone as Evelynn. How should I change my pathing?",
  ]) {
    assert.equal(detectStat(question), undefined);
    assert.deepEqual(detectStats(question), []);
  }
  assert.equal(detectStat("Ahri AS at level 6"), "attackSpeed");
  assert.equal(detectStat("AS Ahri"), "attackSpeed");
  assert.equal(detectStat("Ahri as at level 6"), "attackSpeed");
  assert.equal(detectStat("As Ahri against Zed, compare attack speed"), "attackSpeed");
  assert.deepEqual(detectStats("As Ahri against Zed, compare AS and armor"), ["attackSpeed", "armor"]);
});

test("explicit Korean player introductions survive opponent-first ordering", () => {
  for (const [question, names, mine] of [
    ["파이크 만나면 너무 무서워요ㅠ 제가 소라카인데 어디에 서 있어야 덜 끌리나요", ["파이크", "소라카"], "소라카"],
    ["말파 궁 자꾸 맞는데 제가 제이스면 거리 조절을 어떻게 해야 하죠", ["말파", "제이스"], "제이스"],
    ["상대 룰루 변이 빠졌어 나 파이크인데 지금 들어가려면 뭘 더 봐야 함", ["룰루", "파이크"], "파이크"],
  ] as const) {
    const result = matchupSidesDetailed(question, names.map(name => ({ name })));
    assert.equal(result.sides[0].name, mine);
    assert.equal(result.confident, true);
  }
});

test("translated combo guarantees are removed while adjacent Chinese facts survive", () => {
  const zh = "从 E 起手，后续技能就能确保命中。Q 欺诈宝珠飞出和返回时各能命中一次。";
  assert.equal(checkMatchupFacts(zh, [])[0]?.reason, "unsupported-guarantee");
  assert.equal(checkedMatchupText(zh, []), "Q 欺诈宝珠飞出和返回时各能命中一次。");
  const en = "Starting with E guarantees all follow-up skills will hit. Q can hit on its outward and return paths.";
  assert.equal(checkedMatchupText(en, []), "Q can hit on its outward and return paths.");
  assert.equal(checkedMatchupText("Starting with E guarantees that the follow-up W and Q will hit.", []), "");
  assert.equal(checkedMatchupText("后续技能的命中率会提高。", []), "后续技能的命中率会提高。");
  assert.equal(checkedMatchupText("若挡住定身控制，劳伦特心眼刀会造成眩晕。", []), "若挡住定身控制，劳伦特心眼刀会造成眩晕。");
});
