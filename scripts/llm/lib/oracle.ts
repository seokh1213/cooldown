/**
 * 통계 오라클 로더 (Node 전용)
 *
 * `npm run oracle:build` 가 만든 lol.ps 통계 파일을 읽는다.
 * 선별과 문장 조립은 브라우저에서도 써야 하므로 `oracleCore.ts` 에 있다.
 */
import * as fs from "fs";
import * as path from "path";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./data";
import type { OracleBundle, OracleFile } from "./oracleCore";

export * from "./oracleCore";

export function loadOracleBundle(patch?: string, fileName?: string): OracleBundle | undefined {
  const dir = path.join(PUBLIC_DATA_ROOT, resolvePatchVersion(patch), "oracle");
  if (!fs.existsSync(dir)) return undefined;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("lolps-") && f.endsWith(".json"))
    .sort();
  const pick = fileName ?? files[0];
  if (!pick) return undefined;
  const parsed = JSON.parse(fs.readFileSync(path.join(dir, pick), "utf8")) as OracleFile;
  const { champions, ...meta } = parsed;
  return {
    meta,
    fileName: pick,
    byChampion: new Map(champions.map((c) => [c.id, c])),
  };
}
