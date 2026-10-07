import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { comboDrift } from "./lib/comboDrift";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";
import type { ChampionCard } from "../../src/lib/knowledge/facts";
import type { ComboGuideFile } from "../../src/lib/knowledge/comboGuide";

const { values } = parseArgs({ options: { previous: { type: "string" }, out: { type: "string", default: "research/.cache/combo-drift/report.json" } } });
const patch = resolvePatchVersion();
const cards = (file: string): ChampionCard[] => JSON.parse(fs.readFileSync(file, "utf8")).cards;
const guides = JSON.parse(fs.readFileSync("knowledge/combo-guides.json", "utf8")) as ComboGuideFile;
const report = { schema: 1, patch, previousPatch: guides.patch,
  changes: comboDrift(guides, values.previous ? cards(values.previous) : [], cards(path.join(PUBLIC_DATA_ROOT, patch, "llm/champion-cards-ko_KR.json"))) };
fs.mkdirSync(path.dirname(values.out!), { recursive: true });
fs.writeFileSync(values.out!, JSON.stringify(report, null, 2) + "\n");
console.log(`콤보 검수 대상 ${report.changes.length}챔피언: ${report.changes.map(row => row.champion).join(", ") || "없음"}`);
