import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { ollamaChat } from "../../scripts/llm/lib/ollama";

const runNode = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

test("지식 번들은 같은 내용의 재생성에서 바이트를 보존하고 노트가 바뀔 때만 생성 시각을 갱신한다", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "cooldown-bundle-repeat-"));
  const put = async (file: string, value: unknown) => {
    const target = path.join(directory, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, JSON.stringify(value));
  };
  const output = path.join(directory, "public/data/26.20/llm/advisor-knowledge.json");
  const generate = () => runNode(process.execPath, [
    "--import", path.join(repositoryRoot, "node_modules/tsx/dist/loader.mjs"),
    path.join(repositoryRoot, "scripts/llm/build-advisor-bundle.ts"),
  ], { cwd: directory });
  const book = { champion: "Ambessa", playing: [{ id: "fixture-note", category: "nuance", text: "original note" }], against: [] };
  try {
    const fixture = JSON.parse(await readFile(path.join(repositoryRoot, "research/champion-combos/compatibility/ambessa-26.19.json"), "utf8"));
    await put("public/data/version.json", { patchVersion: "26.20" });
    await put("public/data/26.20/llm/champion-cards-ko_KR.json", { cards: [fixture.comparison.card] });
    await put("knowledge/mechanics-notes.json", { notes: [] });
    await put("knowledge/video-tips.json", { patch: "26.20", notes: [] });
    await put("knowledge/playbooks/Ambessa.json", book);
    await generate();
    const previous = JSON.parse(await readFile(output, "utf8"));
    previous.generatedAt = "2000-01-01T00:00:00.000Z";
    await writeFile(output, JSON.stringify(previous));
    await generate();
    assert.equal(await readFile(output, "utf8"), JSON.stringify(previous));
    book.playing[0].text = "changed note";
    await put("knowledge/playbooks/Ambessa.json", book);
    await generate();
    const changed = await readFile(output, "utf8");
    assert.notEqual(JSON.parse(changed).generatedAt, previous.generatedAt);
    assert.equal(JSON.parse(changed).playbooks.Ambessa.playing[0].text, "changed note");
    await generate();
    assert.equal(await readFile(output, "utf8"), changed);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("manifest가 없으면 연도와 패치 번호가 가장 큰 폴더를 선택한다", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "cooldown-patch-fallback-"));
  try {
    for (const patch of ["25.24", "26.1", "26.9", "26.10"]) {
      await mkdir(path.join(directory, "public/data", patch), { recursive: true });
    }
    const { stdout } = await runNode(process.execPath, [
      "--import", "tsx", "--input-type=module", "--eval",
      `process.chdir(${JSON.stringify(directory)});
       const { resolvePatchVersion } = await import(${JSON.stringify(path.join(repositoryRoot, "scripts/llm/lib/data.ts"))});
       console.log(resolvePatchVersion());`,
    ], { cwd: repositoryRoot });
    assert.equal(stdout.trim(), "26.10");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("소급 조사는 조사 패치별로 읽고 다른 패치나 출처 없는 파일은 거부한다", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "cooldown-patch-research-"));
  const fileNames = ["ability-fallbacks.json", "ability-lost-descriptions.json"];
  try {
    for (const patch of ["26.18", "26.19"]) {
      const folder = path.join(directory, "data/ability-research", patch);
      await mkdir(folder, { recursive: true });
      const entries = [{ championId: "Aatrox", slot: "Q", abilityName: "Q", gaps: [],
        recoveredFrom: { patchVersion: "26.17" }, text: { ko_KR: { bodyHtml: "past tooltip" } },
        sentences: [{ text: "past sentence", lastSeenIn: "26.17", kept: 0.2 }] }];
      for (const name of fileNames) await writeFile(path.join(folder, name), JSON.stringify({ patchVersion: patch, entries }));
    }
    await runNode(process.execPath, ["--import", "tsx", "--input-type=module", "--eval",
      `process.chdir(${JSON.stringify(directory)});
       const assert = (await import("node:assert/strict")).default;
       const fs = await import("node:fs");
       const { loadPatchGaps, patchGapsFile } = await import(${JSON.stringify(path.join(repositoryRoot, "scripts/llm/lib/patchGaps.ts"))});
       for (const patch of ["26.18", "26.19"]) {
         const gaps = loadPatchGaps(patch).get("Aatrox");
         assert.equal(gaps.fallbacks[0].fromPatch, "26.17");
         assert.equal(gaps.lost[0].text, "past sentence");
       }
       for (const name of ${JSON.stringify(fileNames)}) {
         const file = patchGapsFile("26.19", name);
         const valid = fs.readFileSync(file, "utf8");
         for (const patchVersion of ["26.18", undefined]) {
           fs.writeFileSync(file, JSON.stringify({ patchVersion, entries: [] }));
           assert.throws(() => loadPatchGaps("26.19"), /소급 조사 패치 불일치/);
         }
         fs.writeFileSync(file, valid);
       }
       assert.equal(loadPatchGaps("26.20").size, 0);`,
    ], { cwd: repositoryRoot });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("동일 패치 재조사는 이전 원본을 보존하고 쓰기·발행 실패에도 현재 결과를 유지한다", async () => {
  await runNode(process.execPath, ["--import", "tsx", "--input-type=module", "--eval",
    `const assert = (await import("node:assert/strict")).default;
     const fs = await import("node:fs");
     const path = (await import("node:path")).default;
     const { tmpdir } = await import("node:os");
     const { mock } = await import("node:test");
     const { syncBuiltinESMExports } = await import("node:module");
     const directory = fs.mkdtempSync(path.join(tmpdir(), "cooldown-research-publish-"));
     process.chdir(directory);
     const { patchGapsFile, writePatchGaps } = await import(${JSON.stringify(path.join(repositoryRoot, "scripts/llm/lib/patchGaps.ts"))});
     const out = patchGapsFile("26.19", "ability-fallbacks.json");
     const history = path.join(path.dirname(out), "history", "ability-fallbacks");
     const prior = '{ "patchVersion": "26.19", "entries": [] }\\n';
     const next = JSON.stringify({ patchVersion: "26.19", generatedAt: "2026-10-06T00:00:00Z", entries: [] });
     const final = JSON.stringify({ patchVersion: "26.19", generatedAt: "2026-10-06T00:00:00Z", entries: [], recoveredCount: 0 });
     try {
       fs.mkdirSync(path.dirname(out), { recursive: true });
       fs.writeFileSync(out, prior);
       writePatchGaps("26.19", "ability-fallbacks.json", next);
       writePatchGaps("26.19", "ability-fallbacks.json", final);
       assert.equal(fs.readFileSync(out, "utf8"), final);
       assert.deepEqual(new Set(fs.readdirSync(history).map(name => fs.readFileSync(path.join(history, name), "utf8"))), new Set([prior, next]));
       assert.throws(() => writePatchGaps("26.19", "ability-fallbacks.json", '{"patchVersion":"26.18"}'), /저장 패치 불일치/);
       const write = fs.writeFileSync;
       const rename = fs.renameSync;
       for (const failure of ["write", "archive", "publish"]) {
         const method = failure === "write" ? "writeFileSync" : "renameSync";
         const handle = mock.method(fs.default, method, (from, ...args) => {
           if (failure === "write") { write(from, "partial"); throw new Error("disk write failed"); }
           const to = args[0];
           if ((failure === "publish" && to === out) || (failure === "archive" && String(to).startsWith(history))) throw new Error("rename failed");
           return rename(from, to);
         });
         syncBuiltinESMExports();
         try {
           assert.throws(() => writePatchGaps("26.19", "ability-fallbacks.json", next), /failed/);
           assert.equal(fs.readFileSync(out, "utf8"), final);
           for (const name of fs.readdirSync(history)) JSON.parse(fs.readFileSync(path.join(history, name), "utf8"));
           assert.equal(fs.readdirSync(path.dirname(out), { recursive: true }).some(name => String(name).endsWith(".tmp")), false);
         } finally { handle.mock.restore(); syncBuiltinESMExports(); }
       }
     } finally { fs.rmSync(directory, { recursive: true, force: true }); }`,
  ], { cwd: repositoryRoot });
});

test("결측 0건 재조사는 이전 결과를 비우고 scan은 기존 기록을 바꾸지 않는다", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "cooldown-zero-gaps-"));
  const output = path.join(directory, "data/ability-research/26.19/ability-fallbacks.json");
  const archive = path.join(directory, "data/ability-research/26.18/ability-fallbacks.json");
  const prior = JSON.stringify({ patchVersion: "26.19", entries: [{ championId: "Aatrox", slot: "Q", gaps: [{ kind: "empty" }] }] });
  try {
    const championDirectory = path.join(directory, "public/data/26.19/champions/ko_KR");
    await mkdir(championDirectory, { recursive: true });
    await writeFile(path.join(directory, "public/data/version.json"), JSON.stringify({ patchVersion: "26.19" }));
    await writeFile(path.join(championDirectory, "Aatrox.json"), JSON.stringify({ champion: {
      id: "Aatrox", name: "아트록스", abilities: { Q: { name: "Q", summary: "정상 설명", bodyHtml: "정상 설명" } },
    } }));
    await mkdir(path.dirname(output), { recursive: true });
    await mkdir(path.dirname(archive), { recursive: true });
    await writeFile(output, prior);
    await writeFile(archive, "old patch investigation");
    for (const flags of [["--scan"], []]) {
      await runNode(process.execPath, ["--import", "tsx", "--input-type=module", "--eval",
        `process.chdir(${JSON.stringify(directory)});
         process.argv = [process.execPath, "fixture", ...${JSON.stringify(flags)}];
         globalThis.fetch = () => { throw new Error("zero gaps must not request history"); };
         await import(${JSON.stringify(path.join(repositoryRoot, "scripts/llm/fetch-ability-fallbacks.ts"))});`,
      ], { cwd: repositoryRoot });
      if (flags.length) assert.equal(await readFile(output, "utf8"), prior);
    }
    const result = JSON.parse(await readFile(output, "utf8"));
    assert.equal(result.patchVersion, "26.19");
    assert.deepEqual(result.entries, []);
    assert.deepEqual(result.searchedPatches, []);
    assert.equal(result.recoveredCount, 0);
    assert.equal(result.unresolvedCount, 0);
    const history = path.join(path.dirname(output), "history/ability-fallbacks");
    const snapshots = await readdir(history);
    assert.equal(snapshots.length, 1);
    assert.equal(await readFile(path.join(history, snapshots[0]), "utf8"), prior);
    assert.equal(await readFile(archive, "utf8"), "old patch investigation");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("두 소급 CLI의 champ 재조사는 별도 경로를 쓰고 잘못된 ID를 네트워크 전에 거부한다", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "cooldown-partial-research-"));
  const research = path.join(directory, "data/ability-research/26.19");
  const prior = JSON.stringify({ patchVersion: "26.19", entries: [{ championId: "Ahri", slot: "Q", abilityName: "Q", gaps: [] }] });
  const commands = [
    ["fetch-ability-fallbacks.ts", "ability-fallbacks.json"],
    ["find-lost-descriptions.ts", "ability-lost-descriptions.json"],
  ];
  try {
    const champions = path.join(directory, "public/data/26.19/champions/ko_KR");
    await mkdir(champions, { recursive: true });
    await writeFile(path.join(directory, "public/data/version.json"), JSON.stringify({ patchVersion: "26.19" }));
    for (const id of ["Aatrox", "Ahri", "Garen"]) {
      await writeFile(path.join(champions, `${id}.json`), JSON.stringify({ champion: {
        id, name: id, abilities: { Q: { name: "Q", summary: "정상 설명", bodyHtml: "정상 설명" } },
      } }));
    }
    const cache = path.join(directory, "research/.patch-cache");
    await mkdir(cache, { recursive: true });
    await writeFile(path.join(cache, "versions.json"), JSON.stringify(["16.19.1", "16.18.1"]));
    for (const version of ["16.19.1", "16.18.1"]) {
      await mkdir(path.join(cache, version), { recursive: true });
      await writeFile(path.join(cache, version, "descriptions-ko_KR.json"), JSON.stringify([
        { id: "Aatrox", name: "Aatrox", passive: { name: "P", description: "" }, spells: [] },
      ]));
    }
    await mkdir(research, { recursive: true });
    for (const [command, fileName] of commands) {
      await writeFile(path.join(research, fileName), prior);
      for (const requested of [" Garen,Aatrox,Garen ", "../Aatrox", "UnknownChampion", ""]) {
        const run = runNode(process.execPath, ["--import", "tsx", "--input-type=module", "--eval",
          `process.chdir(${JSON.stringify(directory)});
           process.argv = [process.execPath, "fixture", "--champ", ${JSON.stringify(requested)}];
           globalThis.fetch = () => { throw new Error("cached investigation must not request network"); };
           await import(${JSON.stringify(path.join(repositoryRoot, "scripts/llm", command))});`,
        ], { cwd: repositoryRoot });
        if (requested.includes("Garen")) await run;
        else await assert.rejects(run, /조사 챔피언 ID가 유효하지 않음/);
        assert.equal(await readFile(path.join(research, fileName), "utf8"), prior);
      }
    }
    const scopes = await readdir(path.join(research, "partial"));
    assert.equal(scopes.length, 1);
    assert.match(scopes[0], /^Aatrox-Garen-2-[a-f0-9]{16}$/);
    for (const [, fileName] of commands) {
      const result = JSON.parse(await readFile(path.join(research, "partial", scopes[0], fileName), "utf8"));
      assert.deepEqual(result.selectedChampions, ["Aatrox", "Garen"]);
      assert.deepEqual(result.entries, []);
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function responseFor(chunks: unknown[]): Response {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(`${JSON.stringify(chunk)}\n`));
      controller.close();
    },
  }));
}

test("완료 이벤트 없이 끝난 Ollama 답변을 성공으로 처리하지 않는다", async (context) => {
  context.mock.method(globalThis, "fetch", async () => responseFor([
    { message: { role: "assistant", content: "partial answer" }, done: false },
  ]));
  await assert.rejects(ollamaChat({ model: "fixture", messages: [] }), /before a completion event/);
});

test("완료 이벤트가 있는 Ollama 답변의 토큰과 수치가 유지된다", async (context) => {
  context.mock.method(globalThis, "fetch", async () => responseFor([
    { message: { role: "assistant", content: "complete " }, done: false },
    { message: { role: "assistant", content: "answer" }, done: true,
      prompt_eval_count: 8, eval_count: 4, prompt_eval_duration: 1e9, eval_duration: 2e9, total_duration: 3e9 },
  ]));
  const tokens: string[] = [];
  const result = await ollamaChat({ model: "fixture", messages: [], onToken: (token) => tokens.push(token) });
  assert.equal(result.content, "complete answer");
  assert.deepEqual(tokens, ["complete ", "answer"]);
  assert.equal(result.stats.outputTokens, 4);
  assert.equal(result.stats.promptTokens, 8);
  assert.equal(result.stats.generateSeconds, 2);
  assert.equal(result.stats.totalSeconds, 3);
  assert.equal(result.stats.tokensPerSecond, 2);
});
