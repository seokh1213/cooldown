import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fetchChampionAbilities, fetchChampionSkillNames } from "../../scripts/llm/lib/fandom";

function requestUrl(input: string | URL | Request): URL {
  const url = new URL(input instanceof Request ? input.url : String(input));
  assert.equal(url.origin, "https://wiki.leagueoflegends.com");
  assert.equal(url.pathname, "/en-us/api.php");
  return url;
}

test("현행 위키에서 챔피언 스킬 이름을 읽는다", async context => {
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = requestUrl(input);
    assert.equal(url.searchParams.get("titles"), "Module:ChampionData/data");
    return Response.json({ query: { pages: [{ title: "Module:ChampionData/data", revisions: [{ slots: { main: {
      content: '\n  ["Aatrox"] = {\n    ["apiname"] = "Aatrox",\n    ["skill_q"] = {"The Darkin Blade"},\n  }',
    } } }] }] } });
  });
  const champions = await fetchChampionSkillNames();
  assert.deepEqual(champions.get("Aatrox"), { wikiName: "Aatrox", skills: { Q: ["The Darkin Blade"] } });
});

test("옮겨진 스킬 템플릿을 따라가 원래 스킬에 연결한다", async context => {
  const original = "Template:Data Example/Original";
  const target = "Template:Data Example/Renamed";
  const visited: string[] = [];
  context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const title = requestUrl(input).searchParams.get("titles")!;
    visited.push(title);
    const content = title === original ? `#REDIRECT [[${target}]]` : "|description = Deals 100% AD damage.";
    return Response.json({ query: { pages: [{ title, revisions: [{ slots: { main: { content } } }] }] } });
  });
  const abilities = await fetchChampionAbilities("Example", { Q: ["Original"] });
  assert.deepEqual(visited, [original, target]);
  assert.deepEqual(abilities, [{ slot: "Q", name: "Original", wikitext: "|description = Deals 100% AD damage." }]);
});

test("플레이 지식 CLI는 현행 Minion 문서를 읽고 다른 규칙을 보존한다", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "cooldown-wiki-"));
  const llm = path.join(directory, "public/data/26.19/llm");
  mkdirSync(llm, { recursive: true });
  writeFileSync(path.join(directory, "public/data/version.json"), JSON.stringify({ patchVersion: "26.19" }));
  const existing = { name: "기존 룬", page: "Existing", subject: "rune", notes: ["Keep this rule."] };
  writeFileSync(path.join(llm, "rule-notes.json"), JSON.stringify({ schemaVersion: 1, patch: "26.19", rules: [existing] }));
  const script = new URL("../../scripts/llm/fetch-wiki-gameplay.ts", import.meta.url).href;
  const scenario = `
    import assert from "node:assert/strict";
    globalThis.fetch = async input => {
      const url = new URL(input);
      assert.equal(url.origin, "https://wiki.leagueoflegends.com");
      assert.equal(url.pathname, "/en-us/api.php");
      assert.ok(url.searchParams.get("titles").split("|").includes("Minion"));
      return Response.json({ query: { pages: [{ title: "Minion", revisions: [{ slots: { main: {
        content: "== Minion waves ==\\n* Minions first spawn at 30 seconds on Summoner's Rift.",
      } } }] }] } });
    };
    await import(${JSON.stringify(script)});
  `;
  try {
    execFileSync(process.execPath, ["--import", import.meta.resolve("tsx"), "--input-type=module", "--eval", scenario], {
      cwd: directory, stdio: "pipe",
    });
    const output = JSON.parse(readFileSync(path.join(llm, "rule-notes.json"), "utf8"));
    assert.deepEqual(output.rules[0], existing);
    assert.equal(output.rules[1].page, "Minion");
    assert.equal(output.rules[1].subject, "gameplay");
    assert.match(output.rules[1].notes[0], /first spawn at 30 seconds/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
