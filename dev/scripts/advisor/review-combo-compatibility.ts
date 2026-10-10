import { mkdirSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadComboCompilation } from "./lib/comboNotes";
import { resolvePatchVersion } from "./lib/data";

export function reportComboCompatibility(directory = "dev/research/.cache/combo-review") {
  const { reviews } = loadComboCompilation();
  const counts = { total: reviews.length, unchanged: reviews.filter(row => row.status === "unchanged").length,
    compatible: reviews.filter(row => row.status === "compatible").length, pending: reviews.filter(row => row.status === "needs-review").length };
  const report = { schemaVersion: 1, patch: resolvePatchVersion(), counts, reviews };
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  const body = [`## 콤보 호환성 점검 (${report.patch})`, "",
    `변경 없음 ${counts.unchanged}건 · 자동 호환 확인 ${counts.compatible}건 · 검수 대기 ${counts.pending}건`, "",
    "검수 대기 노트는 배포 자료에서 제외합니다. 직접 검수 기록과 자동 호환 확인 기록은 별개입니다.", "",
    ...reviews.filter(row => row.status !== "unchanged").map(row => `- ${row.champion}/${row.id}: ${row.status}, ${row.reasons.join(", ") || "참조 조건 유지"}`),
    "", "변경 전후 원문과 지문: report.json", ""].join("\n");
  writeFileSync(path.join(directory, "report.md"), body);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, body);
  console.log(JSON.stringify({ patch: report.patch, ...counts }));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) reportComboCompatibility();
