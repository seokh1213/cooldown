/**
 * 새 패치로 넘어간 도우미 자료를 새 자료로 다시 짓는다
 *
 * `generate-static-data` 가 옛 패치의 `llm/` 을 새 패치로 옮겨 두면(`.carried-from`) 여기서:
 *   1. 카드(세 언어)를 새 툴팁·능력치로 다시 짓는다        llm:build
 *   2. 이름 색인·지식 묶음·노트 번역을 다시 짓는다          llm:names · llm:bundle · llm:note-tr
 *   3. 미리 쓴 상성 답은 재료 지문이 그대로인 쌍만 남긴다   (리워크·툴팁 변경 쌍은 노트 조립으로)
 * 위키에서 받은 입력(대시·위키 메타·규칙 노트 …)은 옮긴 그대로 쓴다. 다시 받는 것은 사람이 한다.
 *
 * 옮긴 표시가 없으면 아무것도 하지 않는다(같은 패치 안의 갱신).
 *
 * 사용: npm run llm:carry            (CI: generate-static-data 다음)
 *       npm run llm:carry -- --force (표시 없이 다시 짓기)
 *       npm run llm:carry -- --force --matchups-only (미리 쓴 답만 새 재료에 맞대 거르기)
 */
import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";

const patch = resolvePatchVersion();
const llmDir = path.join(PUBLIC_DATA_ROOT, patch, "llm");
const marker = path.join(llmDir, ".carried-from");

async function main() {
  if (!fs.existsSync(llmDir)) {
    console.log(`도우미 자료 없음: ${path.relative(process.cwd(), llmDir)} — 옮길 옛 패치가 없었다`);
    return;
  }
  if (!fs.existsSync(marker) && !process.argv.includes("--force")) {
    console.log("옮긴 도우미 자료 없음 — 할 일 없음");
    return;
  }
  const from = fs.existsSync(marker) ? fs.readFileSync(marker, "utf8").trim() : patch;
  console.log(`도우미 자료 ${from} → ${patch} 다시 짓기`);
  const run = (cmd: string) => {
    console.log(`$ ${cmd}`);
    execSync(cmd, { stdio: "inherit" });
  };
  // --matchups-only: 카드·묶음은 이미 새 자료로 지어져 있고 미리 쓴 상성 답만 새 재료에 맞대 거른다
  // (옛 패치에서 새로 써 온 쌍을 들일 때)
  if (!process.argv.includes("--matchups-only")) {
    for (const lang of ["ko_KR", "en_US", "zh_CN"]) run(`npm run --silent llm:build -- --lang ${lang}`);
    run("npm run --silent llm:names");
    run("npm run --silent llm:bundle");
    run("npm run --silent llm:note-tr");
  }

  // 미리 쓴 상성 답: 새 재료로 지문을 다시 재어 같은 쌍만 남긴다. 모듈이 불러올 때 카드를 읽으므로
  // 카드를 다시 지은 뒤에 불러온다.
  const dir = path.join(llmDir, "matchups");
  if (fs.existsSync(dir)) {
    const { materialFingerprint } = await import("./precompute-matchups");
    let kept = 0;
    let dropped = 0;
    for (const file of fs.readdirSync(dir).filter((f) => /^[A-Za-z]+\.json$/.test(f))) {
      const me = file.replace(".json", "");
      const full = path.join(dir, file);
      const data = JSON.parse(fs.readFileSync(full, "utf8")) as { patch: string; pairs: Record<string, unknown>; materials?: Record<string, string> };
      const stale = new Set<string>();
      for (const enemy of Object.keys(data.pairs)) {
        let now: string | undefined;
        try {
          now = materialFingerprint(me, enemy);
        } catch {
          now = undefined; // 챔피언이 사라졌다
        }
        if (!now || data.materials?.[enemy] !== now) stale.add(enemy);
      }
      for (const enemy of stale) {
        delete data.pairs[enemy];
        delete data.materials?.[enemy];
      }
      kept += Object.keys(data.pairs).length;
      dropped += stale.size;
      data.patch = patch;
      fs.writeFileSync(full, JSON.stringify(data));
      // 옮긴 번역(<id>.<lang>.json)도 같은 쌍만 남긴다
      for (const lang of ["en_US", "zh_CN"]) {
        const tr = path.join(dir, `${me}.${lang}.json`);
        if (!fs.existsSync(tr)) continue;
        const t = JSON.parse(fs.readFileSync(tr, "utf8")) as { patch: string; pairs: Record<string, unknown> };
        for (const enemy of Object.keys(t.pairs)) if (!data.pairs[enemy]) delete t.pairs[enemy];
        t.patch = patch;
        fs.writeFileSync(tr, JSON.stringify(t));
      }
    }
    console.log(`미리 쓴 상성 답: ${kept}쌍 유지 · 재료가 바뀐 ${dropped}쌍 제외(노트 조립으로 답한다)`);
  }
  if (fs.existsSync(marker)) fs.rmSync(marker);
  console.log("완료");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
