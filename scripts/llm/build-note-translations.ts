/**
 * 노트 번역 — 번역 원자(knowledge/atoms)를 노트 단위로 잇는다
 *
 * 플레이북 노트는 한국어뿐이라 영어·중국어 상성 답은 카드 도출 문장만으로 지어졌다(맹검 1.8~2.2점).
 * 노트를 원자로 나눠 옮긴 것(translate-atoms.ts)이 있으니, 같은 노트(source)에서 나온 원자를
 * 순서대로 이어 그 노트의 번역으로 쓴다. 앱의 조립 규칙(digestSections)은 노트 단위로 돌기 때문이다.
 *
 * 원자 절반 이상이 번역되지 않은 노트는 뺀다 — 앞뒤가 빠진 번역은 뜻이 달라질 수 있다.
 * 원자가 있는 챔피언만 번역이 생긴다. 없는 노트는 지금처럼 싣지 않는다.
 *
 * 사용: npx tsx scripts/llm/build-note-translations.ts
 * 출력: public/data/<patch>/llm/note-translations-<lang>.json  { patch, notes: { 노트 id: 글 } }
 */
import * as fs from "fs";
import * as path from "path";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";
import type { AtomFile } from "./build-note-atoms";

const LANGS = ["en_US", "zh_CN"] as const;
const ATOM_DIR = path.join(process.cwd(), "knowledge", "atoms");

const patch = resolvePatchVersion();
const files = fs.existsSync(ATOM_DIR) ? fs.readdirSync(ATOM_DIR).filter((f) => f.endsWith(".json")) : [];
for (const lang of LANGS) {
  const notes: Record<string, string> = {};
  let skipped = 0;
  for (const file of files) {
    const atoms = (JSON.parse(fs.readFileSync(path.join(ATOM_DIR, file), "utf8")) as AtomFile).atoms;
    const bySource = new Map<string, typeof atoms>();
    for (const atom of atoms) {
      if (!atom.source.startsWith("playbook:")) continue;
      bySource.set(atom.source, [...(bySource.get(atom.source) ?? []), atom]);
    }
    for (const [source, list] of bySource) {
      const parts = list.map((atom) => (atom.text as Record<string, string | undefined>)[lang]).filter((t): t is string => !!t);
      if (parts.length * 2 < list.length) {
        skipped += 1;
        continue;
      }
      notes[source.slice("playbook:".length)] = parts.join(lang === "zh_CN" ? "" : " ");
    }
  }
  const out = path.join(PUBLIC_DATA_ROOT, patch, "llm", `note-translations-${lang}.json`);
  fs.writeFileSync(out, JSON.stringify({ patch, notes }), "utf8");
  console.log(`생성: ${path.relative(process.cwd(), out)} (노트 ${Object.keys(notes).length}건, 번역 절반 미만이라 뺀 노트 ${skipped}건, ${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
}
