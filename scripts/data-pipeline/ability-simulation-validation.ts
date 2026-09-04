import * as fs from "node:fs";
import * as path from "node:path";
import { decodeChampionDetail } from "../../src/data/contracts/championDataDecoder";
import type { AbilitySlot } from "../../src/data/contracts/championData";
import type { StaticDataSources } from "../../src/data/contracts/staticData";

const ACTIVE_SLOTS: Exclude<AbilitySlot, "P">[] = ["Q", "W", "E", "R"];

export interface AbilitySimulationValidationReport {
  schemaVersion: 1;
  patchVersion: string;
  sources: StaticDataSources;
  summary: {
    abilities: number;
    complete: number;
    unsupported: number;
    unavailable: number;
  };
  unsupportedPartTypes: Record<string, number>;
  incomplete: Array<{
    championId: string;
    slot: Exclude<AbilitySlot, "P">;
    status: "unsupported" | "unavailable";
    unsupportedPartTypes: string[];
  }>;
}

export function validateAbilitySimulations(
  versionDir: string,
  patchVersion: string,
  sources: StaticDataSources
): AbilitySimulationValidationReport {
  const championDir = path.join(versionDir, "champions", "en_US");
  const files = fs.readdirSync(championDir).filter(
    (fileName) => fileName.endsWith(".json") && fileName !== "index.json"
  );
  const report: AbilitySimulationValidationReport = {
    schemaVersion: 1,
    patchVersion,
    sources,
    summary: { abilities: 0, complete: 0, unsupported: 0, unavailable: 0 },
    unsupportedPartTypes: {},
    incomplete: [],
  };
  for (const fileName of files) {
    const detail = decodeChampionDetail(JSON.parse(
      fs.readFileSync(path.join(championDir, fileName), "utf8")
    ));
    for (const slot of ACTIVE_SLOTS) {
      const simulation = detail.champion.abilities[slot].simulation;
      report.summary.abilities += 1;
      report.summary[simulation.status] += 1;
      if (simulation.status !== "complete") {
        report.incomplete.push({
          championId: detail.champion.id,
          slot,
          status: simulation.status,
          unsupportedPartTypes: simulation.unsupportedPartTypes,
        });
      }
      for (const type of simulation.unsupportedPartTypes) {
        report.unsupportedPartTypes[type] =
          (report.unsupportedPartTypes[type] ?? 0) + 1;
      }
    }
  }
  return report;
}
