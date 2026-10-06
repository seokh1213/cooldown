import * as fs from "node:fs";
import * as path from "node:path";
import { JUDGE_KIND9_CRITERIA, JUDGE_KIND_INSTRUCTIONS, JUDGE_MINE_INSTRUCTIONS } from "../../../src/lib/advisor/routeAsk";
import { actCriteria, ACT_INSTRUCTIONS } from "../../../src/lib/advisor/conversation";
import { corpus } from "../vector-search/corpus";
import { HELD_TOPIC_CHAMPIONS } from "../lib/topicCases";
import { loadData, type Lang } from "../kev-agent/lib";

const output = process.argv[2];
fs.mkdirSync(output, { recursive: true });
const languages: Lang[] = ["ko_KR", "en_US", "zh_CN"];
const champions = Object.fromEntries(languages.map((lang) => [lang,
  loadData(lang).cards.filter((card) => !HELD_TOPIC_CHAMPIONS.has(card.id)).map(({ id, name }) => ({ id, name }))]));
for (const lang of languages) {
  fs.writeFileSync(path.join(output, `corpus-${lang}.json`), JSON.stringify(corpus(lang)));
}
fs.writeFileSync(path.join(output, "schema.json"), JSON.stringify({
  champions, kind: { instructions: JUDGE_KIND_INSTRUCTIONS, criteria: JUDGE_KIND9_CRITERIA },
  mineInstructions: JUDGE_MINE_INSTRUCTIONS, actInstructions: ACT_INSTRUCTIONS,
  // Names are substituted in Python; descriptions always originate in the app.
  act: actCriteria("{M}", "{E}"),
}));
console.log("Frozen corpus and app criteria exported");
