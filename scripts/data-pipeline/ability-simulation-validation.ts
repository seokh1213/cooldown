import * as fs from "node:fs";
import * as path from "node:path";
import { decodeChampionDetail } from "../../src/data/contracts/championDataDecoder";
import type {
  AbilitySimulationExpr,
  AbilitySlot,
} from "../../src/data/contracts/championData";
import type { StaticDataSources } from "../../src/data/contracts/staticData";

const ACTIVE_SLOTS: Exclude<AbilitySlot, "P">[] = ["Q", "W", "E", "R"];

export interface AbilitySimulationValidationReport {
  schemaVersion: 1;
  patchVersion: string;
  sources: StaticDataSources;
  summary: {
    abilities: number;
    complete: number;
    expression: number;
    unsupported: number;
    unavailable: number;
  };
  unsupportedPartTypes: Record<string, number>;
  /** 중첩 소유 슬롯이 정해지지 않은 스킬. ability-stack-sources.json 에 추가하면 사라진다. */
  unmappedStackSources: Array<{ championId: string; slot: Exclude<AbilitySlot, "P">; buff: string }>;
  incomplete: Array<{
    championId: string;
    slot: Exclude<AbilitySlot, "P">;
    status: "expression" | "unsupported" | "unavailable";
    unsupportedPartTypes: string[];
  }>;
}

/** 표현식 안의 중첩 노드를 모두 모은다. */
function buffStackNodes(
  node: AbilitySimulationExpr,
): Array<Extract<AbilitySimulationExpr, { kind: "buffStacks" }>> {
  if (node.kind === "buffStacks") return [node];
  if (node.kind === "sum" || node.kind === "product") {
    return node.parts.flatMap(buffStackNodes);
  }
  return [];
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
    summary: { abilities: 0, complete: 0, expression: 0, unsupported: 0, unavailable: 0 },
    unsupportedPartTypes: {},
    unmappedStackSources: [],
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
      if (simulation.status === "expression" && simulation.expression) {
        for (const node of buffStackNodes(simulation.expression.root)) {
          if (node.stackSource) continue;
          report.unmappedStackSources.push({
            championId: detail.champion.id,
            slot,
            buff: node.buff,
          });
        }
      }
      for (const type of simulation.unsupportedPartTypes) {
        report.unsupportedPartTypes[type] =
          (report.unsupportedPartTypes[type] ?? 0) + 1;
      }
    }
  }
  return report;
}
