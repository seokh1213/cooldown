import { digest } from "./bank";
import { compareReports } from "./report";
import type { QualityReport } from "./types";

export interface DataProvenance { dataFiles: Array<[string, string]> }
const requestArtifacts = new Set(["public/models/offline/request-v1.bin", "public/models/offline/request-v1.json"]);
const statArtifact = "public/models/offline/stat-v1.json";

function verifiedFiles(report: QualityReport, provenance: DataProvenance): Map<string, string> {
  const files = new Map(provenance.dataFiles);
  if (files.size !== provenance.dataFiles.length || digest(provenance.dataFiles) !== report.dataHash)
    throw new Error("Data provenance does not match the measured report");
  return files;
}

/** 분류기 교체 실험만 허용한다. 게임 데이터와 QA 웨이트가 달라지면 새 대조군이 필요하다. */
export function comparePipelineReports(current: QualityReport, baseline: QualityReport,
  provenance: { current: DataProvenance; baseline: DataProvenance }) {
  if (current.graphHash !== baseline.graphHash || current.numericPurpose !== baseline.numericPurpose || current.model !== baseline.model)
    throw new Error("Pipeline comparison requires the same QA weights and model purpose");
  const currentFiles = verifiedFiles(current, provenance.current), baselineFiles = verifiedFiles(baseline, provenance.baseline);
  const paths = new Set([...currentFiles.keys(), ...baselineFiles.keys()]);
  const changedArtifacts = [...paths].filter(file => currentFiles.get(file) !== baselineFiles.get(file))
    .map(file => ({ file, before: baselineFiles.get(file), after: currentFiles.get(file) }));
  if (changedArtifacts.some(change => !(requestArtifacts.has(change.file) && change.before && change.after)
    && !(change.file === statArtifact && change.after)))
    throw new Error("Pipeline comparison only permits request-v1 replacement or stat-v1 addition/replacement");
  // 원본 해시는 보존하고, 위에서 검증한 분류기 차이만 strict 비교의 데이터 일치 조건에서 제외한다.
  return { ...compareReports({ ...current, dataHash: baseline.dataHash }, baseline), changedArtifacts };
}
