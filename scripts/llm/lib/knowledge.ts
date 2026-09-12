/**
 * 큐레이션 지식(사람이 검증한 팁) 로더
 *
 * knowledge/tips/*.json — 파일 하나가 챔피언 하나(또는 주제 하나)를 담는다.
 * 데이터에서 자동 도출할 수 없는 "왜/언제" 지식(룬 선택 이유, 라인 운영, 메타)을 담는 계층.
 */
import * as fs from "fs";
import * as path from "path";

import type { CuratedTip, CuratedTipFile } from "./knowledgeCore";

export * from "./knowledgeCore";

export const KNOWLEDGE_ROOT = path.resolve(process.cwd(), "knowledge", "tips");

export function loadCuratedTips(root = KNOWLEDGE_ROOT): CuratedTip[] {
  if (!fs.existsSync(root)) return [];
  const tips: CuratedTip[] = [];
  for (const file of fs.readdirSync(root).filter((f) => f.endsWith(".json")).sort()) {
    const parsed = JSON.parse(fs.readFileSync(path.join(root, file), "utf8")) as CuratedTipFile;
    parsed.tips.forEach((tip, index) => {
      tips.push({
        ...tip,
        champion: parsed.champion,
        id: tip.id ?? `${parsed.champion}-${index + 1}`,
      });
    });
  }
  return tips;
}

