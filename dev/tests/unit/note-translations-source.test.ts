import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { joinedNotes, noteSourceDigest } from "../../scripts/advisor/build-note-translations";

test("번역 원자를 검수한 한국어 노트가 바뀌거나 삭제되면 옛 번역을 재발행하지 않는다", t => {
  const root = mkdtempSync(path.join(os.tmpdir(), "note-translations-source-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const atoms = path.join(root, "atoms"), playbooks = path.join(root, "playbooks");
  mkdirSync(atoms); mkdirSync(playbooks);
  const text = "E는 챔피언을 끌어당깁니다.";
  const atomFile = path.join(atoms, "Kled.json"), bookFile = path.join(playbooks, "Kled.json");
  writeFileSync(atomFile, JSON.stringify({ champion: "Kled", patch: "26.19", sourceDigests: { "kled-skill-e": noteSourceDigest(text) },
    atoms: [{ id: "Kled-a0", source: "playbook:kled-skill-e", text: { ko: text, en_US: "E pulls champions.", zh_CN: "E会拉拽英雄。" } }] }));
  const book = { champion: "Kled", playing: [{ id: "kled-skill-e", text }], against: [] };
  writeFileSync(bookFile, JSON.stringify(book));
  assert.equal(joinedNotes("en_US", atoms, playbooks).notes["kled-skill-e"], "E pulls champions.");
  const before = readFileSync(atomFile, "utf8");
  book.playing[0].text = "E는 미니언과 작은 몬스터만 끌어당깁니다.";
  writeFileSync(bookFile, JSON.stringify(book));
  for (const lang of ["en_US", "zh_CN"] as const) assert.deepEqual(joinedNotes(lang, atoms, playbooks), { notes: {}, skipped: 1 });
  rmSync(bookFile);
  assert.deepEqual(joinedNotes("en_US", atoms, playbooks), { notes: {}, skipped: 1 });
  assert.equal(readFileSync(atomFile, "utf8"), before, "검수 지문을 자동 갱신하지 않는다");
});

test("새 출처 검수 기록이 없는 기존 번역과 절반 미만 번역 제외 조건을 유지한다", t => {
  const root = mkdtempSync(path.join(os.tmpdir(), "note-translations-legacy-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(path.join(root, "Example.json"), JSON.stringify({ atoms: [
    { source: "playbook:legacy", text: { en_US: "Existing translation." } },
    { source: "playbook:partial", text: { en_US: "Only one part." } },
    { source: "playbook:partial", text: {} }, { source: "playbook:partial", text: {} },
  ] }));
  assert.deepEqual(joinedNotes("en_US", root, path.join(root, "missing")), { notes: { legacy: "Existing translation." }, skipped: 1 });
});
