/** 한 갈래 문항 세트를 조립 답의 세 자세함으로 옮긴다(맹검용). */
import fs from "node:fs";
import { FOCUSED, matchupAnswer } from "./lib/matchupEval";
import { matchupDigest, type DigestDetail } from "../../src/lib/advisor/prose";
import * as path from "path";
import { PUBLIC_DATA_ROOT, resolvePatchVersion } from "./lib/data";
import type { AdvisorData } from "../../src/lib/advisor/context";

const patch = resolvePatchVersion();
const read = (file: string) => JSON.parse(fs.readFileSync(path.join(PUBLIC_DATA_ROOT, patch, file), "utf8"));
const cards = read("llm/champion-cards-ko_KR.json").cards as Array<{ id: string }>;
const data = {
  cards,
  items: read("items-normalized-ko_KR.json").items,
  cardById: new Map(cards.map((card) => [card.id, card])),
  playbooks: new Map(Object.entries(read("llm/advisor-knowledge.json").playbooks)),
} as unknown as AdvisorData;
const out: Record<string, Array<{ q: string; text: string }>> = {};
for (const detail of ["short", "focus-lead", "focus-full"] as DigestDetail[]) {
  out[detail] = FOCUSED.map(([a, b, focus, q]) => {
    const answer = matchupAnswer(data, data.cardById.get(a)!, data.cardById.get(b)!, q);
    if (answer.kind !== "compare" || !answer.notes?.plan) throw new Error(q);
    answer.notes.plan.focus = focus as never;
    return { q, text: matchupDigest(answer, "ko_KR", detail) };
  });
}
fs.writeFileSync(process.argv[2] ?? "digest-detail.json", JSON.stringify(out, null, 2));
