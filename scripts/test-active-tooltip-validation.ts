import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  assertActiveTooltipReport,
  validateActiveTooltipFiles,
} from "./data-pipeline/active-tooltip-validation";

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "tooltip-validation-"));
fs.writeFileSync(
  path.join(directory, "Test-ko_KR.json"),
  JSON.stringify({
    champion: {
      spells: [
        {
          id: "TestQ",
          tooltipSource: "communitydragon",
          tooltipDiagnostics: { unresolvedTokens: ["KnownToken"] },
        },
        { id: "TestW" },
      ],
    },
  })
);

const report = validateActiveTooltipFiles(directory, "26.17", ["ko_KR"], {
  unresolvedTokens: ["KnownToken"],
  missingTooltips: ["Test:W"],
});
assert.deepEqual(report.totals, {
  abilities: 2,
  localized: 1,
  fallback: 1,
  withDiagnostics: 1,
  uniqueUnresolvedTokens: 1,
});
assert.doesNotThrow(() => assertActiveTooltipReport(report));

report.unexpectedTokens.push("NewToken");
assert.throws(() => assertActiveTooltipReport(report), /1 new tokens/);
fs.rmSync(directory, { recursive: true });

console.log("✅ Active tooltip regression validation passed");
