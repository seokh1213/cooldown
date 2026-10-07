import * as fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { isTransientError, readHealth, saveHealth, sourceFailure, SourceHttpError } from "./source-health.mjs";

const DDRAGON_VERSIONS = "https://ddragon.leagueoflegends.com/api/versions.json";
const CDRAGON = "https://raw.communitydragon.org";

export async function getJson(url, fetcher = fetch) {
  for (let attempt = 0; ; attempt++) {
    try {
      const response = await fetcher(url, { signal: globalThis.AbortSignal.timeout(20_000) });
      if (!response.ok) throw new SourceHttpError(response.status, url);
      return await response.json();
    } catch (error) {
      if (attempt === 3 || !isTransientError(error)) throw error;
      await delay(500 * 2 ** attempt);
    }
  }
}

async function buildChanged(local, fetcher) {
  const cdragon = local.sources?.cdragon;
  const stored = local.cdragonBuild;
  if (!cdragon || !stored) return true;
  // 빌드 표식은 선택 자료다. 없으면 실제 필수 원천을 확인한 뒤 다시 생성한다.
  const results = await Promise.allSettled([
    getJson(`${CDRAGON}/${cdragon}/content-metadata.json`, fetcher),
    getJson(`${CDRAGON}/json/${cdragon}/game/data/`, fetcher),
  ]);
  if (results.some(result => result.status === "rejected")) return true;
  const [metadata, listing] = results.map(result => result.value);
  const characters = Array.isArray(listing) ? listing.find(entry => entry?.name === "characters")?.mtime : undefined;
  return typeof metadata?.version !== "string" || typeof characters !== "string"
    || metadata.version !== stored.content || characters !== stored.characters;
}

export async function checkUpstream({ event, local, fetcher = fetch, now = new Date(), retryPending = false }) {
  if (event === "push") return { run: true, reason: "저장소의 검증 자료로 코드 배포", checked: false };
  let requestedDdragon;
  try {
    const versions = await getJson(DDRAGON_VERSIONS, fetcher);
    requestedDdragon = Array.isArray(versions) ? versions[0] : undefined;
    if (typeof requestedDdragon !== "string" || !/^\d+\.\d+\.\d+$/.test(requestedDdragon)) {
      throw new Error("Invalid DDragon version list");
    }
    const changed = requestedDdragon !== local.sources?.ddragon || await buildChanged(local, fetcher);
    const run = event === "workflow_dispatch" || retryPending || changed || now.getUTCHours() === 0;
    if (run) {
      const cdragon = requestedDdragon.split(".").slice(0, 2).join(".");
      const calculations = await getJson(`${CDRAGON}/${cdragon}/game/items.cdtb.bin.json`, fetcher);
      if (!calculations || typeof calculations !== "object" || Array.isArray(calculations)
        || !Object.keys(calculations).some(key => key.startsWith("Items/"))) {
        throw new Error("Invalid exact-patch CDragon item calculations");
      }
    }
    return { run, reason: run ? "필수 원천 확인 완료, 자료 갱신" : "패치와 빌드가 그대로", requestedDdragon, checked: true };
  } catch (error) {
    return { run: false, reason: "원천 확인 미완료", requestedDdragon, checked: true, failure: sourceFailure("static-data-preflight", error) };
  }
}

export async function main(root = process.cwd(), fetcher = fetch) {
  const local = JSON.parse(fs.readFileSync(path.join(root, "public/data/version.json"), "utf8"));
  const file = process.env.SOURCE_HEALTH_FILE ?? path.join(root, "research/.cache/source-health/static.json");
  const event = process.env.GITHUB_EVENT_NAME;
  const previous = event === "push" ? undefined : readHealth(file);
  const result = await checkUpstream({ event, local, fetcher, retryPending: Boolean(previous && previous.status !== "available") });
  if (result.checked) {
    const state = saveHealth(file, result.failure ? [result.failure] : [], {
      publishedPatch: local.patchVersion, requestedDdragon: result.requestedDdragon ?? null,
    });
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, "health_checked=true\n");
    if (state.status === "unavailable") throw new Error(`Source preflight unavailable: ${result.failure?.error}`);
  }
  console.log(`${result.run ? "실행" : "건너뜀"}: ${result.reason}`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `run=${result.run}\n`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
