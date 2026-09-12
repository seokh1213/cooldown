/**
 * 상류가 바뀌었는지만 값싸게 판단한다.
 *
 * CI 회차마다 173챔피언 × 3언어를 통째로 다시 받은 뒤에야 변경 여부를 보던 것을
 * 앞으로 당긴 것이다. 의존성 없이 돌아야 해서 내장 fetch 만 쓴다.
 *
 * 두 가지를 본다.
 *  - DDragon 최신 버전: Riot 이 값을 바꾸면 여기가 올라간다.
 *  - CommunityDragon 빌드 표식: 같은 패치에서도 CDragon 은 BIN 속성 해시를 풀어
 *    다시 내보낸다. 스킬 시뮬레이션이 그 이름으로 조회하므로 우리에게 의미가 있다.
 *
 * 판단이 서지 않으면(조회 실패, 표식 없음) 그냥 돌린다. 놓치는 것보다 한 번 더 만드는
 * 편이 낫다.
 *
 * 사용: node scripts/ci/upstream-changed.mjs
 * 출력: GITHUB_OUTPUT 에 run=true|false
 */
import * as fs from "node:fs";

const DDRAGON_VERSIONS = "https://ddragon.leagueoflegends.com/api/versions.json";
const CDRAGON = "https://raw.communitydragon.org";

async function getJson(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) return undefined;
    return await response.json();
  } catch {
    return undefined;
  }
}

function emit(run, reason) {
  console.log(`${run ? "실행" : "건너뜀"}: ${reason}`);
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `run=${run}\n`);
  }
  return run;
}

async function main() {
  if (process.env.GITHUB_EVENT_NAME && process.env.GITHUB_EVENT_NAME !== "schedule") {
    emit(true, `예약 실행이 아님 (${process.env.GITHUB_EVENT_NAME})`);
    return;
  }

  let local;
  try {
    local = JSON.parse(fs.readFileSync("public/data/version.json", "utf8"));
  } catch {
    emit(true, "version.json 을 읽지 못함");
    return;
  }

  const versions = await getJson(DDRAGON_VERSIONS);
  const remoteDdragon = Array.isArray(versions) ? versions[0] : undefined;
  if (typeof remoteDdragon !== "string") {
    emit(true, "DDragon 버전 목록을 받지 못함");
    return;
  }
  console.log(`DDragon 로컬 ${local.sources?.ddragon} / 원격 ${remoteDdragon}`);
  if (remoteDdragon !== local.sources?.ddragon) {
    emit(true, "패치가 바뀜");
    return;
  }

  // 패치는 그대로다. CDragon 이 같은 패치를 다시 내보냈는지 본다.
  const cdragon = local.sources?.cdragon;
  const stored = local.cdragonBuild;
  if (!cdragon || !stored) {
    emit(true, "CDragon 표식이 없음 (다음 회차부터 비교 가능)");
    return;
  }

  const metadata = await getJson(`${CDRAGON}/${cdragon}/content-metadata.json`);
  const listing = await getJson(`${CDRAGON}/json/${cdragon}/game/data/`);
  const content = typeof metadata?.version === "string" ? metadata.version : undefined;
  const characters = Array.isArray(listing)
    ? listing.find((entry) => entry?.name === "characters")?.mtime
    : undefined;

  if (!content || typeof characters !== "string") {
    emit(true, "CDragon 표식을 받지 못함");
    return;
  }

  console.log(`CDragon 콘텐츠 로컬 ${stored.content} / 원격 ${content}`);
  console.log(`CDragon characters 로컬 ${stored.characters} / 원격 ${characters}`);
  if (content !== stored.content) {
    emit(true, "CDragon 콘텐츠 빌드가 바뀜");
    return;
  }
  if (characters !== stored.characters) {
    emit(true, "CDragon 이 characters 트리를 다시 내보냄");
    return;
  }

  // 표식은 챔피언 트리까지만 본다. 아이템·룬·문자열표는 다른 트리(rcp-be-lol-game-data,
  // stringtable)에서 오므로 그쪽이 바뀌면 위 비교로는 잡히지 않는다.
  // 하루 한 번은 그냥 다시 만들어 그 공백을 메운다.
  if (new Date().getUTCHours() === 0) {
    emit(true, "표식은 그대로지만 하루 한 번 회차");
    return;
  }

  emit(false, "패치도 CDragon 빌드도 그대로");
}

await main();
